import json
import os
import uuid
import logging
from datetime import datetime, timedelta
from typing import Optional, List
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from app.config import settings
from app.models import ScheduledJob, ScheduledJobCreate, JobExecution

logger = logging.getLogger(__name__)

# --- Cron Helpers ---

DAY_MAP = {"mon": "1", "tue": "2", "wed": "3", "thu": "4", "fri": "5", "sat": "6", "sun": "0"}


def schedule_to_cron(frequency: str, time: str = "09:00", day_of_week: str = None, day_of_month: int = None) -> str:
    hour, minute = time.split(":")
    if frequency == "daily":
        return f"{minute} {hour} * * *"
    elif frequency == "weekdays":
        return f"{minute} {hour} * * 1-5"
    elif frequency == "weekly":
        dow = DAY_MAP.get(day_of_week, "1") if day_of_week else "1"
        return f"{minute} {hour} * * {dow}"
    elif frequency == "monthly":
        dom = day_of_month or 1
        return f"{minute} {hour} {dom} * *"
    else:  # custom — return as-is from cron_expression
        return f"{minute} {hour} * * *"


def cron_to_human(cron_expression: str) -> str:
    try:
        parts = cron_expression.strip().split()
        if len(parts) != 5:
            return cron_expression
        minute, hour, dom, month, dow = parts
        time_str = f"{int(hour):02d}:{int(minute):02d}"

        if dom == "*" and month == "*" and dow == "*":
            return f"Daily at {time_str}"
        elif dom == "*" and month == "*" and dow == "1-5":
            return f"Weekdays at {time_str}"
        elif dom == "*" and month == "*" and dow != "*":
            day_names = {"0": "Sun", "1": "Mon", "2": "Tue", "3": "Wed", "4": "Thu", "5": "Fri", "6": "Sat", "7": "Sun"}
            day = day_names.get(dow, dow)
            return f"Weekly on {day} at {time_str}"
        elif dom != "*" and month == "*" and dow == "*":
            return f"Monthly on day {dom} at {time_str}"
        else:
            return f"Custom ({cron_expression})"
    except Exception:
        return cron_expression


class SchedulerManager:
    def __init__(self, agent_manager, document_manager, ws_manager):
        self.agent_manager = agent_manager
        self.document_manager = document_manager
        self.ws_manager = ws_manager
        self.correction_manager = None  # Set from main.py after init
        self.scheduler = AsyncIOScheduler()
        self.jobs: dict = {}
        self.jobs_file = f"{settings.DATA_DIR}/scheduled_jobs.json"
        self.executions_dir = f"{settings.DATA_DIR}/job_executions"
        os.makedirs(self.executions_dir, exist_ok=True)
        self._load_jobs()

    def _load_jobs(self):
        if os.path.exists(self.jobs_file):
            try:
                with open(self.jobs_file, "r") as f:
                    data = json.load(f)
                    self.jobs = data
            except:
                self.jobs = {}
        else:
            self.jobs = {}

    def _save_jobs(self):
        os.makedirs(settings.DATA_DIR, exist_ok=True)
        with open(self.jobs_file, "w") as f:
            json.dump(self.jobs, f, indent=2)

    def start(self):
        if not self.scheduler.running:
            self.scheduler.start()
            for job_id, job_config in self.jobs.items():
                if job_config.get("enabled", True):
                    self._register_job(job_id, job_config)

    def shutdown(self):
        if self.scheduler.running:
            self.scheduler.shutdown()

    def _register_job(self, job_id: str, job_config: dict):
        try:
            trigger = CronTrigger.from_crontab(job_config["cron_expression"])
            self.scheduler.add_job(
                self._run_job_callback,
                trigger,
                args=[job_id],
                id=job_id,
                replace_existing=True,
            )
        except Exception as e:
            logger.error(f"Error registering job {job_id}: {e}")

    def _run_job_callback(self, job_id: str):
        self.run_job_now(job_id)

    def add_job(self, data: ScheduledJobCreate) -> ScheduledJob:
        job_id = str(uuid.uuid4())
        job = ScheduledJob(
            id=job_id,
            name=data.name,
            description=data.description,
            cron_expression=data.cron_expression,
            prompt=data.prompt,
            agent_id=data.agent_id,
            enabled=True,
            last_run=None,
            next_run=None,
        )

        job_dict = job.model_dump(mode="json")
        job_dict["last_run"] = None
        job_dict["next_run"] = None

        self.jobs[job_id] = job_dict
        self._save_jobs()

        if self.scheduler.running:
            self._register_job(job_id, job_dict)

        return job

    def add_job_simple(self, data) -> ScheduledJob:
        """Create job from simplified schedule builder data."""
        cron = data.cron_expression if data.frequency == "custom" and data.cron_expression else schedule_to_cron(
            data.frequency, data.time, data.day_of_week, data.day_of_month
        )
        from app.models import ScheduledJobCreate
        return self.add_job(ScheduledJobCreate(
            name=data.name,
            description=data.description,
            cron_expression=cron,
            prompt=data.prompt,
            agent_id=data.agent_id,
        ))

    def remove_job(self, job_id: str):
        if job_id in self.jobs:
            del self.jobs[job_id]
            self._save_jobs()
            if self.scheduler.running:
                try:
                    self.scheduler.remove_job(job_id)
                except:
                    pass

    def toggle_job(self, job_id: str) -> Optional[ScheduledJob]:
        if job_id not in self.jobs:
            return None

        job_config = self.jobs[job_id]
        job_config["enabled"] = not job_config.get("enabled", True)
        self._save_jobs()

        if self.scheduler.running:
            if job_config["enabled"]:
                self._register_job(job_id, job_config)
            else:
                try:
                    self.scheduler.remove_job(job_id)
                except:
                    pass

        job_config["last_run"] = None
        job_config["next_run"] = None
        return ScheduledJob(**job_config)

    def list_jobs(self) -> List[dict]:
        result = []
        for job_id, job_config in self.jobs.items():
            job_dict = dict(job_config)
            job_dict["human_schedule"] = cron_to_human(job_dict.get("cron_expression", ""))
            # Get last execution status
            execs = self.get_executions(job_id, limit=1)
            if execs:
                job_dict["last_status"] = execs[0].status
                job_dict["last_execution_id"] = execs[0].id
            else:
                job_dict["last_status"] = None
                job_dict["last_execution_id"] = None
            if self.scheduler.running:
                try:
                    sched_job = self.scheduler.get_job(job_id)
                    if sched_job:
                        job_dict["next_run"] = sched_job.next_run_time.isoformat() if sched_job.next_run_time else None
                except:
                    pass
            result.append(job_dict)
        return result

    def get_calendar(self, days: int = 30) -> List[dict]:
        calendar = {}
        now = datetime.now()

        for job_id, job_config in self.jobs.items():
            if not job_config.get("enabled", True):
                continue
            try:
                trigger = CronTrigger.from_crontab(job_config["cron_expression"])
                current = now
                for _ in range(days * 10):
                    next_run = trigger.get_next_fire_time(None, current)
                    if next_run is None or (next_run - now).days >= days:
                        break
                    date_key = next_run.strftime("%Y-%m-%d")
                    if date_key not in calendar:
                        calendar[date_key] = []
                    calendar[date_key].append({
                        "name": job_config["name"],
                        "job_id": job_id,
                        "time": next_run.strftime("%H:%M"),
                    })
                    current = next_run + timedelta(minutes=1)
            except:
                pass

        return [{"date": date, "jobs": jobs} for date, jobs in sorted(calendar.items())]

    def get_cron_preview(self, frequency: str, time: str = "09:00", day_of_week: str = None, day_of_month: int = None) -> dict:
        cron = schedule_to_cron(frequency, time, day_of_week, day_of_month)
        human = cron_to_human(cron)
        # Calculate next 5 runs
        next_runs = []
        try:
            trigger = CronTrigger.from_crontab(cron)
            current = datetime.now()
            for _ in range(5):
                next_run = trigger.get_next_fire_time(None, current)
                if next_run:
                    next_runs.append(next_run.strftime("%Y-%m-%d %H:%M"))
                    current = next_run + timedelta(minutes=1)
        except:
            pass
        return {"cron": cron, "human": human, "next_runs": next_runs}

    # --- Execution Tracking ---

    def _exec_dir(self, job_id: str) -> str:
        d = f"{self.executions_dir}/{job_id}"
        os.makedirs(d, exist_ok=True)
        return d

    def _save_execution(self, execution: JobExecution):
        path = f"{self._exec_dir(execution.job_id)}/{execution.id}.json"
        with open(path, "w") as f:
            json.dump(execution.model_dump(mode="json"), f, indent=2)

    def get_executions(self, job_id: str, limit: int = 20) -> List[JobExecution]:
        d = self._exec_dir(job_id)
        executions = []
        for fn in os.listdir(d):
            if not fn.endswith(".json"):
                continue
            try:
                with open(f"{d}/{fn}", "r") as f:
                    executions.append(JobExecution(**json.load(f)))
            except:
                continue
        executions.sort(key=lambda e: e.executed_at, reverse=True)
        return executions[:limit]

    def get_execution(self, job_id: str, execution_id: str) -> Optional[JobExecution]:
        path = f"{self._exec_dir(job_id)}/{execution_id}.json"
        if not os.path.exists(path):
            return None
        try:
            with open(path, "r") as f:
                return JobExecution(**json.load(f))
        except:
            return None

    async def update_execution_feedback(self, job_id: str, execution_id: str, rating: int, feedback: str) -> Optional[JobExecution]:
        execution = self.get_execution(job_id, execution_id)
        if not execution:
            return None

        execution.rating = rating
        execution.feedback = feedback
        self._save_execution(execution)

        # If rated poorly (1-2), auto-create a correction for the agent
        if rating <= 2 and feedback and self.correction_manager:
            try:
                from app.models import CorrectionCreate
                await self.correction_manager.add(CorrectionCreate(
                    agent_id=execution.agent_id,
                    original_response=execution.result_preview,
                    correction=feedback,
                    tags=["scheduled-job", execution.job_name],
                ))
                logger.info(f"Auto-created correction from poor job rating for agent {execution.agent_id}")
            except Exception as e:
                logger.warning(f"Failed to create correction from feedback: {e}")

        return execution

    def run_job_now(self, job_id: str):
        if job_id not in self.jobs:
            return {"error": "Job not found"}

        job_config = self.jobs[job_id]
        agent_id = job_config["agent_id"]
        prompt = job_config["prompt"]

        try:
            response = self.agent_manager.chat(agent_id, prompt)

            agent = self.agent_manager.get_agent(agent_id)
            from app.models import DocumentCreate
            doc = self.document_manager.create_document(
                DocumentCreate(
                    title=f"{job_config['name']} - {datetime.now().strftime('%Y-%m-%d %H:%M')}",
                    content=response,
                    doc_type="report",
                    agent_id=agent_id,
                )
            )

            # Save execution record
            execution = JobExecution(
                id=str(uuid.uuid4()),
                job_id=job_id,
                job_name=job_config["name"],
                agent_id=agent_id,
                agent_name=agent.name if agent else "Unknown",
                executed_at=datetime.now(),
                status="success",
                result_preview=response[:300],
                result_document_id=doc.id,
            )
            self._save_execution(execution)

            job_config["last_run"] = datetime.now().isoformat()
            self._save_jobs()

            import asyncio
            asyncio.create_task(
                self.ws_manager.broadcast(
                    "job_completed",
                    {
                        "job_id": job_id,
                        "job_name": job_config["name"],
                        "agent_name": agent.name if agent else "Unknown",
                        "result": response[:200],
                        "execution_id": execution.id,
                        "status": "success",
                    },
                )
            )

            return {
                "job_id": job_id,
                "status": "completed",
                "result": response,
                "execution_id": execution.id,
            }
        except Exception as e:
            # Save failed execution
            agent = self.agent_manager.get_agent(agent_id)
            execution = JobExecution(
                id=str(uuid.uuid4()),
                job_id=job_id,
                job_name=job_config["name"],
                agent_id=agent_id,
                agent_name=agent.name if agent else "Unknown",
                executed_at=datetime.now(),
                status="failed",
                result_preview="",
                error=str(e),
            )
            self._save_execution(execution)
            return {"job_id": job_id, "status": "failed", "error": str(e)}

import json
import os
import uuid
from datetime import datetime, timedelta
from typing import Optional, List
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from app.config import settings
from app.models import ScheduledJob, ScheduledJobCreate


class SchedulerManager:
    def __init__(self, agent_manager, document_manager, ws_manager):
        self.agent_manager = agent_manager
        self.document_manager = document_manager
        self.ws_manager = ws_manager
        self.scheduler = AsyncIOScheduler()
        self.jobs: dict = {}
        self.jobs_file = f"{settings.DATA_DIR}/scheduled_jobs.json"
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
            # Re-register all enabled jobs
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
            print(f"Error registering job {job_id}: {e}")

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

        # Register with scheduler if running
        if self.scheduler.running:
            self._register_job(job_id, job_dict)

        return job

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
                    calendar[date_key].append(
                        {
                            "name": job_config["name"],
                            "job_id": job_id,
                            "time": next_run.strftime("%H:%M"),
                        }
                    )
                    current = next_run + timedelta(minutes=1)
            except:
                pass

        return [
            {"date": date, "jobs": jobs}
            for date, jobs in sorted(calendar.items())
        ]

    def run_job_now(self, job_id: str):
        if job_id not in self.jobs:
            return {"error": "Job not found"}

        job_config = self.jobs[job_id]
        agent_id = job_config["agent_id"]
        prompt = job_config["prompt"]

        try:
            # Run the agent with the prompt
            response = self.agent_manager.chat(agent_id, prompt)

            # Save as document
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

            # Update last_run
            job_config["last_run"] = datetime.now().isoformat()
            self._save_jobs()

            # Broadcast
            import asyncio
            asyncio.create_task(
                self.ws_manager.broadcast(
                    "job_completed",
                    {
                        "job_id": job_id,
                        "job_name": job_config["name"],
                        "agent_name": agent.name if agent else "Unknown",
                        "result": response[:200],
                    },
                )
            )

            return {
                "job_id": job_id,
                "status": "completed",
                "result": response,
            }
        except Exception as e:
            return {"job_id": job_id, "status": "failed", "error": str(e)}

import json
import os
import uuid
import logging
from datetime import datetime, timedelta, timezone
from typing import Optional, List
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from app.config import settings
from app.models import ScheduledJob, ScheduledJobCreate, JobExecution

logger = logging.getLogger(__name__)

# --- Cron Helpers ---

DAY_MAP = {"mon": "1", "tue": "2", "wed": "3", "thu": "4", "fri": "5", "sat": "6", "sun": "0"}

DEFAULT_JOBS = [
    # --- Core Agent Jobs ---
    {
        "agent_name": "Scout",
        "name": "Scout Morning Briefing",
        "description": "Daily market trends, competitor moves, and growth opportunities",
        "cron_expression": "0 9 * * 1-5",
        "prompt": (
            "Scan for the latest market trends, competitor moves, and growth opportunities "
            "for HealthDataLab, Altituding, and IrisLab. Focus on health tech, wellness platforms, "
            "and AI agent developments. Produce a concise briefing with the top 5 findings and "
            "recommended actions."
        ),
    },
    {
        "agent_name": "Quill",
        "name": "Quill Weekly Content Calendar",
        "description": "Weekly content ideas for blog, social media, and email",
        "cron_expression": "0 10 * * 1",
        "prompt": (
            "Review this week's content priorities for HealthDataLab. Draft 3 content ideas "
            "(blog post, social media, email) based on recent market insights and HDL's positioning. "
            "Include headlines, key angles, and target audience for each."
        ),
    },
    {
        "agent_name": "Forge",
        "name": "Forge Daily Tech Report",
        "description": "System health, job execution errors, and technical status",
        "cron_expression": "0 17 * * 1-5",
        "prompt": (
            "Review The Lab's system health: check for any errors in recent job executions, "
            "review agent performance metrics, and note any technical issues or improvements needed. "
            "Produce a brief tech status report."
        ),
    },
    {
        "agent_name": "Radar",
        "name": "Radar Daily Outreach",
        "description": "Partnership and outreach opportunities for HealthDataLab",
        "cron_expression": "0 11 * * 1-5",
        "prompt": (
            "Identify 3 potential partnership or outreach opportunities for HealthDataLab. "
            "Focus on health practitioners, wellness platforms, corporate wellness programmes, "
            "and IIPA members. For each opportunity, note: who they are, why they're relevant, "
            "and a suggested approach."
        ),
    },
    # --- HDL Agent Jobs ---
    {
        "agent_name": "Agent Bob",
        "name": "Agent Bob \u2014 Weekly HDL Assessment",
        "description": "Submit health + longevity assessment to healthdatalab.net",
        "cron_expression": "0 10 * * 1",
        "prompt": "Submit my weekly health check and longevity assessment to healthdatalab.net",
        "use_master_chat": True,
    },
    {
        "agent_name": "Agent Alice",
        "name": "Agent Alice \u2014 Weekly HDL Assessment",
        "description": "Submit health + longevity assessment to healthdatalab.net",
        "cron_expression": "0 14 * * 1",
        "prompt": "Submit my weekly health check and longevity assessment to healthdatalab.net",
        "use_master_chat": True,
    },
    {
        "agent_name": "Agent Charlie",
        "name": "Agent Charlie \u2014 Weekly HDL Assessment",
        "description": "Submit health + longevity assessment to healthdatalab.net",
        "cron_expression": "0 11 * * 3",
        "prompt": "Submit my weekly health check and longevity assessment to healthdatalab.net",
        "use_master_chat": True,
    },
    {
        "agent_name": "Agent Diana",
        "name": "Agent Diana \u2014 Weekly HDL Assessment",
        "description": "Submit health + longevity assessment to healthdatalab.net",
        "cron_expression": "0 15 * * 3",
        "prompt": "Submit my weekly health check and longevity assessment to healthdatalab.net",
        "use_master_chat": True,
    },
    {
        "agent_name": "Agent Echo",
        "name": "Agent Echo \u2014 Weekly HDL Assessment",
        "description": "Submit health + longevity assessment to healthdatalab.net",
        "cron_expression": "0 10 * * 5",
        "prompt": "Submit my weekly health check and longevity assessment to healthdatalab.net",
        "use_master_chat": True,
    },
    {
        "agent_name": "Dr Bob",
        "name": "Dr Bob \u2014 Weekly HDL Status Report",
        "description": "Check credit balances for all 5 HDL test clients and produce a weekly status report",
        "cron_expression": "0 16 * * 5",
        "prompt": "Check the credit balance for all 5 HDL test clients and produce a weekly status report. Flag any agents that didn't submit this week.",
        "use_master_chat": True,
    },
]


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
    def __init__(self, agent_manager, document_manager, ws_manager, report_manager=None):
        self.agent_manager = agent_manager
        self.document_manager = document_manager
        self.ws_manager = ws_manager
        self.report_manager = report_manager
        self.correction_manager = None  # Set from main.py after init
        self.notion_bridge = None  # Set from main.py after init
        self.knowledge_manager = None  # Set from main.py after init
        self.agent_memory_manager = None  # Set from main.py after init
        self.master_chat = None  # Set from main.py after init
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
                    if isinstance(data, dict):
                        self.jobs = data
                    else:
                        logger.warning("scheduled_jobs.json is not a dict, resetting")
                        self.jobs = {}
            except Exception as e:
                logger.error(f"Error loading scheduled jobs: {e}")
                self.jobs = {}
        else:
            self.jobs = {}

    def _save_jobs(self):
        os.makedirs(settings.DATA_DIR, exist_ok=True)
        with open(self.jobs_file, "w") as f:
            json.dump(self.jobs, f, indent=2)

    def _seed_default_jobs(self):
        """Create default scheduled jobs that don't already exist."""
        existing_names = {j.get("name") for j in self.jobs.values()}
        created = 0

        for default_job in DEFAULT_JOBS:
            if default_job["name"] in existing_names:
                continue

            agent = self.agent_manager.get_agent_by_name(default_job["agent_name"])
            if not agent:
                logger.warning(
                    f"Cannot seed job '{default_job['name']}': "
                    f"agent '{default_job['agent_name']}' not found"
                )
                continue

            job_id = str(uuid.uuid4())
            self.jobs[job_id] = {
                "id": job_id,
                "name": default_job["name"],
                "description": default_job["description"],
                "cron_expression": default_job["cron_expression"],
                "prompt": default_job["prompt"],
                "agent_id": agent.id,
                "agent_name": agent.name,
                "enabled": True,
                "last_run": None,
                "next_run": None,
            }
            created += 1

        if created:
            self._save_jobs()
            logger.info(f"Seeded {created} default scheduled jobs")

    def start(self):
        try:
            self._seed_default_jobs()
        except Exception as e:
            logger.error(f"Failed to seed default jobs: {e}")
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
        # Store agent name for fallback lookup if agent_id becomes stale
        agent = self.agent_manager.get_agent(data.agent_id)
        job_dict["agent_name"] = agent.name if agent else None

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
            try:
                execs = self.get_executions(job_id, limit=1)
                if execs:
                    job_dict["last_status"] = execs[0].status
                    job_dict["last_execution_id"] = execs[0].id
                else:
                    job_dict["last_status"] = None
                    job_dict["last_execution_id"] = None
            except Exception as e:
                logger.warning(f"Failed to load executions for job {job_id}: {e}")
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
        now = datetime.now(timezone.utc)

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
            current = datetime.now(timezone.utc)
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

    def _broadcast_sync(self, event_type: str, data: dict):
        """Broadcast WebSocket event from a sync context (thread pool)."""
        import asyncio
        try:
            loop = asyncio.get_event_loop()
            if loop.is_running():
                loop.call_soon_threadsafe(
                    asyncio.ensure_future,
                    self.ws_manager.broadcast(event_type, data),
                )
            else:
                asyncio.run(self.ws_manager.broadcast(event_type, data))
        except RuntimeError:
            pass  # No event loop available — skip broadcast

    def _publish_to_notion_sync(self, title: str, content: str, agent_name: str):
        """Publish job output to Notion from a sync context."""
        if not self.notion_bridge or not self.notion_bridge.configured:
            return
        import asyncio

        async def _publish_and_notify():
            try:
                url = await self.notion_bridge.publish_report(
                    title=title,
                    content=content,
                    agent_name=agent_name,
                    report_type="scheduled",
                    source="scheduled",
                )
                if not url:
                    error_msg = self.notion_bridge._last_publish_error or "Unknown error"
                    logger.error(f"Notion publish failed for '{title}': {error_msg}")
                    self._broadcast_sync("notion_publish_failed", {
                        "job_name": title,
                        "agent_name": agent_name,
                        "error": error_msg,
                    })
            except Exception as e:
                logger.error(f"Notion publish error for '{title}': {e}")
                self._broadcast_sync("notion_publish_failed", {
                    "job_name": title,
                    "agent_name": agent_name,
                    "error": str(e),
                })

        try:
            loop = asyncio.get_event_loop()
            if loop.is_running():
                loop.call_soon_threadsafe(asyncio.ensure_future, _publish_and_notify())
                logger.info(f"Notion publish queued for: {title}")
            else:
                asyncio.run(_publish_and_notify())
        except Exception as e:
            logger.error(f"Notion publish scheduling failed for '{title}': {e}")

    def _resolve_agent(self, agent_id: str, job_config: dict):
        """Resolve agent by ID, falling back to name-based lookup."""
        agent = self.agent_manager.get_agent(agent_id)
        if agent:
            return agent

        # Fallback: try by stored agent_name
        agent_name = job_config.get("agent_name")
        if agent_name:
            agent = self.agent_manager.get_agent_by_name(agent_name)
            if agent:
                # Update stored agent_id to current one
                job_config["agent_id"] = agent.id
                self._save_jobs()
                return agent

        return None

    def run_job_now(self, job_id: str):
        if job_id not in self.jobs:
            return {"error": "Job not found"}

        job_config = self.jobs[job_id]
        agent_id = job_config["agent_id"]
        prompt = job_config["prompt"]

        # Resolve agent with fallback to name-based lookup
        agent = self._resolve_agent(agent_id, job_config)
        if not agent:
            execution = JobExecution(
                id=str(uuid.uuid4()),
                job_id=job_id,
                job_name=job_config["name"],
                agent_id=agent_id,
                agent_name="Unknown",
                executed_at=datetime.now(timezone.utc),
                status="failed",
                result_preview="",
                error=f"Agent not found (id: {agent_id}). Delete and recreate this job.",
            )
            self._save_execution(execution)
            return {"job_id": job_id, "status": "failed", "error": execution.error}

        # Use resolved agent's current ID
        agent_id = agent.id

        try:
            # Fix 1: Build memory context for the agent before chat
            memory_context = ""
            try:
                if self.knowledge_manager and self.agent_memory_manager and self.correction_manager:
                    import asyncio as _aio
                    from app.memory_engine import build_context
                    _loop = _aio.get_event_loop()
                    if _loop.is_running():
                        future = _aio.run_coroutine_threadsafe(
                            build_context(agent.id, prompt, self.knowledge_manager, self.agent_memory_manager, self.correction_manager),
                            _loop,
                        )
                        memory_context = future.result(timeout=10)
                    logger.info(f"Memory context built for job '{job_config['name']}' ({len(memory_context)} chars)")
            except Exception as e:
                logger.warning(f"Memory context build failed for job {job_id}: {e}")

            enhanced_prompt = f"{memory_context}\n\n{prompt}" if memory_context else prompt

            # Fix 3: Route HDL jobs through Master Chat for tool access
            use_master_chat = job_config.get("use_master_chat", False)
            if use_master_chat and self.master_chat:
                import asyncio as _aio
                _loop = _aio.get_event_loop()
                if _loop.is_running():
                    future = _aio.run_coroutine_threadsafe(
                        self.master_chat.chat(enhanced_prompt),
                        _loop,
                    )
                    response = future.result(timeout=120)
                else:
                    response = self.agent_manager.chat(agent_id, enhanced_prompt)
            else:
                response = self.agent_manager.chat(agent_id, enhanced_prompt)

            # Check for error responses returned as strings
            if response.startswith("Error:") or response.startswith("Configuration Error:"):
                raise RuntimeError(response)

            from app.models import DocumentCreate, ReportCreate
            doc = self.document_manager.create_document(
                DocumentCreate(
                    title=f"{job_config['name']} - {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M')}",
                    content=response,
                    doc_type="report",
                    agent_id=agent_id,
                )
            )
            # Also create a Report so it appears in the Documents tab
            if self.report_manager:
                try:
                    self.report_manager.create_report(ReportCreate(
                        title=f"{job_config['name']} - {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M')}",
                        content=response,
                        report_type="scheduled",
                        agent_id=agent_id,
                        agent_name=agent.name,
                        source="scheduled",
                    ))
                except Exception:
                    pass

            execution = JobExecution(
                id=str(uuid.uuid4()),
                job_id=job_id,
                job_name=job_config["name"],
                agent_id=agent_id,
                agent_name=agent.name,
                executed_at=datetime.now(timezone.utc),
                status="success",
                result_preview=response[:300],
                result_document_id=doc.id,
            )
            self._save_execution(execution)

            job_config["last_run"] = datetime.now(timezone.utc).isoformat()
            self._save_jobs()

            # Auto-publish to Notion
            self._publish_to_notion_sync(job_config["name"], response, agent.name)

            # Fix 2: Extract learnings from the report into agent memory
            try:
                if self.agent_memory_manager:
                    def _llm_for_extraction(extraction_prompt):
                        llm = self.agent_manager.get_llm(agent.provider, agent.model_name)
                        from langchain_core.messages import HumanMessage
                        return llm.invoke([HumanMessage(content=extraction_prompt)]).content

                    import asyncio as _aio
                    _loop = _aio.get_event_loop()
                    if _loop.is_running():
                        _aio.run_coroutine_threadsafe(
                            self.agent_memory_manager.extract_from_report(
                                agent_id=agent.id, report_content=response,
                                report_type="scheduled", agent_name=agent.name,
                                llm_func=_llm_for_extraction,
                            ),
                            _loop,
                        )
                        logger.info(f"Learning extraction queued for job: {job_config['name']}")
            except Exception as e:
                logger.warning(f"Learning extraction failed for job {job_id}: {e}")

            self._broadcast_sync("job_completed", {
                "job_id": job_id,
                "job_name": job_config["name"],
                "agent_name": agent.name,
                "result": response[:200],
                "execution_id": execution.id,
                "status": "success",
            })

            return {
                "job_id": job_id,
                "status": "completed",
                "result": response,
                "execution_id": execution.id,
            }
        except Exception as e:
            execution = JobExecution(
                id=str(uuid.uuid4()),
                job_id=job_id,
                job_name=job_config["name"],
                agent_id=agent_id,
                agent_name=agent.name,
                executed_at=datetime.now(timezone.utc),
                status="failed",
                result_preview="",
                error=str(e),
            )
            self._save_execution(execution)
            return {"job_id": job_id, "status": "failed", "error": str(e)}

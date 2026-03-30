"""Strategy Manager — maps business problems to agents, schedules, and progress."""

import json
import os
import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional

from app.config import settings

STRATEGIES_DIR = os.path.join(settings.DATA_DIR, "strategies")
os.makedirs(STRATEGIES_DIR, exist_ok=True)


class StrategyManager:
    """CRUD + progress aggregation for business strategies."""

    def _path(self, sid: str) -> str:
        return os.path.join(STRATEGIES_DIR, f"{sid}.json")

    # --- CRUD ---

    def create(self, data: dict) -> dict:
        sid = str(uuid.uuid4())
        now = datetime.now(timezone.utc).isoformat()
        strategy = {
            "id": sid,
            "title": data["title"],
            "problem": data.get("problem", ""),
            "approach": data.get("approach", ""),
            "agent_ids": data.get("agent_ids", []),
            "schedule_ids": data.get("schedule_ids", []),
            "status": data.get("status", "active"),  # active, paused, completed
            "tags": data.get("tags", []),
            "created_at": now,
            "updated_at": now,
        }
        with open(self._path(sid), "w") as f:
            json.dump(strategy, f, indent=2)
        return strategy

    def get(self, sid: str) -> Optional[dict]:
        path = self._path(sid)
        if not os.path.isfile(path):
            return None
        with open(path) as f:
            return json.load(f)

    def list_all(self) -> list:
        strategies = []
        if not os.path.isdir(STRATEGIES_DIR):
            return strategies
        for fname in os.listdir(STRATEGIES_DIR):
            if fname.endswith(".json"):
                with open(os.path.join(STRATEGIES_DIR, fname)) as f:
                    strategies.append(json.load(f))
        strategies.sort(key=lambda s: s.get("created_at", ""), reverse=True)
        return strategies

    def update(self, sid: str, data: dict) -> Optional[dict]:
        strategy = self.get(sid)
        if not strategy:
            return None
        for key in ("title", "problem", "approach", "agent_ids", "schedule_ids", "status", "tags"):
            if key in data:
                strategy[key] = data[key]
        strategy["updated_at"] = datetime.now(timezone.utc).isoformat()
        with open(self._path(sid), "w") as f:
            json.dump(strategy, f, indent=2)
        return strategy

    def delete(self, sid: str) -> bool:
        path = self._path(sid)
        if os.path.isfile(path):
            os.remove(path)
            return True
        return False

    # --- Progress aggregation ---

    def get_progress(self, sid: str, report_manager, scheduler_manager, cost_tracker, agent_memory_manager=None, agent_manager=None) -> dict:
        """Aggregate progress metrics from linked agents and schedules."""
        strategy = self.get(sid)
        if not strategy:
            return {}

        agent_ids = set(strategy.get("agent_ids", []))
        manual_schedule_ids = set(strategy.get("schedule_ids", []))

        # Auto-detect schedules for assigned agents
        all_jobs = scheduler_manager.list_jobs()
        detected_schedules = []
        all_schedule_ids = set(manual_schedule_ids)
        for job in all_jobs:
            if job.get("agent_id") in agent_ids:
                all_schedule_ids.add(job["id"])
                detected_schedules.append({
                    "id": job["id"],
                    "name": job.get("name", "Unnamed"),
                    "agent_id": job.get("agent_id"),
                    "cron": job.get("human_schedule") or job.get("cron_expression", ""),
                    "enabled": job.get("enabled", True),
                })
            elif job.get("id") in manual_schedule_ids:
                detected_schedules.append({
                    "id": job["id"],
                    "name": job.get("name", "Unnamed"),
                    "agent_id": job.get("agent_id"),
                    "cron": job.get("human_schedule") or job.get("cron_expression", ""),
                    "enabled": job.get("enabled", True),
                })

        # Count reports by linked agents (list_reports returns Pydantic Report objects)
        all_reports = report_manager.list_reports()
        agent_reports = [r for r in all_reports if r.agent_id in agent_ids]

        # Count job executions for all discovered schedules
        total_executions = 0
        successful_executions = 0
        all_execs = []
        for job_id in all_schedule_ids:
            execs = scheduler_manager.get_executions(job_id, limit=100)
            total_executions += len(execs)
            successful_executions += sum(1 for e in execs if e.status == "success")
            all_execs.extend(execs)

        # Sort all executions by time, keep recent 5
        all_execs.sort(key=lambda e: e.executed_at, reverse=True)
        recent_executions = [
            {
                "id": e.id,
                "job_name": e.job_name,
                "agent_name": e.agent_name,
                "executed_at": e.executed_at.isoformat() if hasattr(e.executed_at, 'isoformat') else str(e.executed_at),
                "status": e.status,
                "result_preview": e.result_preview,
                "result_document_id": e.result_document_id,
                "error": e.error,
            }
            for e in all_execs[:5]
        ]

        # Last execution timestamp
        last_execution_at = recent_executions[0]["executed_at"] if recent_executions else None

        # Success rate over last 7 days
        week_ago = (datetime.now(timezone.utc) - timedelta(days=7)).isoformat()
        execs_7d = [e for e in all_execs if (e.executed_at.isoformat() if hasattr(e.executed_at, 'isoformat') else str(e.executed_at)) >= week_ago]
        success_rate_7d = round(sum(1 for e in execs_7d if e.status == "success") / len(execs_7d) * 100) if execs_7d else None

        # Reports this week
        reports_this_week = sum(
            1 for r in agent_reports
            if str(r.created_at) >= week_ago
        )

        # Recent reports (last 3)
        sorted_reports = sorted(agent_reports, key=lambda r: str(r.created_at), reverse=True)
        recent_reports = [
            {
                "id": r.id,
                "title": r.title,
                "agent_name": r.agent_name,
                "created_at": r.created_at.isoformat() if hasattr(r.created_at, 'isoformat') else str(r.created_at),
                "report_type": r.report_type,
            }
            for r in sorted_reports[:3]
        ]

        # Cost for strategy agents over 7 days
        total_cost_7d = cost_tracker.get_cost_for_agents(agent_ids, days=7)

        # Gather recent agent learnings linked to this strategy
        agent_learnings = []
        if agent_memory_manager and agent_manager:
            try:
                for aid in agent_ids:
                    agent = agent_manager.get_agent(aid)
                    recent_mems = agent_memory_manager.get_recent(aid, limit=3)
                    for mem in recent_mems:
                        agent_learnings.append({
                            "agent_name": agent.name if agent else aid,
                            "content": mem.content,
                            "type": mem.memory_type if hasattr(mem, 'memory_type') else "insight",
                            "created_at": mem.created_at.isoformat() if hasattr(mem.created_at, 'isoformat') else str(mem.created_at),
                        })
                agent_learnings.sort(key=lambda x: x.get("created_at", ""), reverse=True)
                agent_learnings = agent_learnings[:8]
            except Exception:
                pass

        return {
            "strategy_id": sid,
            "reports_count": len(agent_reports),
            "reports_this_week": reports_this_week,
            "executions_total": total_executions,
            "executions_successful": successful_executions,
            "agent_count": len(agent_ids),
            "schedule_count": len(all_schedule_ids),
            "schedules": detected_schedules,
            "recent_executions": recent_executions,
            "recent_reports": recent_reports,
            "last_execution_at": last_execution_at,
            "success_rate_7d": success_rate_7d,
            "total_cost_7d": total_cost_7d,
            "agent_learnings": agent_learnings,
        }

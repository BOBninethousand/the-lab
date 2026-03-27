"""Strategy Manager — maps business problems to agents, schedules, and progress."""

import json
import os
import uuid
from datetime import datetime, timedelta
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
        now = datetime.utcnow().isoformat()
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
        strategy["updated_at"] = datetime.utcnow().isoformat()
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

    def get_progress(self, sid: str, report_manager, scheduler_manager, cost_tracker) -> dict:
        """Aggregate progress metrics from linked agents and schedules."""
        strategy = self.get(sid)
        if not strategy:
            return {}

        agent_ids = set(strategy.get("agent_ids", []))
        schedule_ids = set(strategy.get("schedule_ids", []))

        # Count reports by linked agents (list_reports returns Pydantic Report objects)
        all_reports = report_manager.list_reports()
        agent_reports = [r for r in all_reports if r.agent_id in agent_ids]

        # Count job executions for linked schedules
        total_executions = 0
        successful_executions = 0
        for job_id in schedule_ids:
            execs = scheduler_manager.get_executions(job_id, limit=100)
            total_executions += len(execs)
            successful_executions += sum(1 for e in execs if e.status == "success")

        # Reports this week
        week_ago = (datetime.utcnow() - timedelta(days=7)).isoformat()
        reports_this_week = sum(
            1 for r in agent_reports
            if str(r.created_at) >= week_ago
        )

        return {
            "strategy_id": sid,
            "reports_count": len(agent_reports),
            "reports_this_week": reports_this_week,
            "executions_total": total_executions,
            "executions_successful": successful_executions,
            "agent_count": len(agent_ids),
            "schedule_count": len(schedule_ids),
        }

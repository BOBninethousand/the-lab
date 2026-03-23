"""
Cost Tracker — logs every LLM call with provider, model, token usage, and estimated cost.
Solves Problem #1 from the meeting: "If it goes through the API we're burning tokens."
"""

import json
import os
import uuid
from datetime import datetime, timedelta
from typing import List, Optional, Dict, Any
from app.config import settings


# Approximate pricing per 1M tokens (input/output) as of early 2026
MODEL_PRICING = {
    # OpenAI
    "gpt-4o": {"input": 2.50, "output": 10.00},
    "gpt-4o-mini": {"input": 0.15, "output": 0.60},
    "gpt-4-turbo": {"input": 10.00, "output": 30.00},
    "gpt-3.5-turbo": {"input": 0.50, "output": 1.50},
    # Anthropic
    "claude-sonnet-4-20250514": {"input": 3.00, "output": 15.00},
    "claude-opus-4-20250514": {"input": 15.00, "output": 75.00},
    "claude-haiku-3-5-20241022": {"input": 0.80, "output": 4.00},
    # Ollama (local — free)
    "llama3": {"input": 0.0, "output": 0.0},
    "mistral": {"input": 0.0, "output": 0.0},
    "codellama": {"input": 0.0, "output": 0.0},
}

# Fallback pricing for unknown models
DEFAULT_PRICING = {
    "openai": {"input": 5.00, "output": 15.00},
    "anthropic": {"input": 3.00, "output": 15.00},
    "ollama": {"input": 0.0, "output": 0.0},
}


class CostTracker:
    def __init__(self):
        self.log_file = f"{settings.DATA_DIR}/cost_log.json"
        self.daily_budget = float(os.getenv("DAILY_API_BUDGET", "5.00"))
        self._ensure_file()

    def _ensure_file(self):
        os.makedirs(settings.DATA_DIR, exist_ok=True)
        if not os.path.exists(self.log_file):
            with open(self.log_file, "w") as f:
                json.dump([], f)

    def _load_log(self) -> List[dict]:
        try:
            with open(self.log_file, "r") as f:
                return json.load(f)
        except:
            return []

    def _save_log(self, log: List[dict]):
        with open(self.log_file, "w") as f:
            json.dump(log, f, indent=2)

    def estimate_cost(self, provider: str, model: str, input_tokens: int, output_tokens: int) -> float:
        pricing = MODEL_PRICING.get(model, DEFAULT_PRICING.get(provider, {"input": 5.0, "output": 15.0}))
        input_cost = (input_tokens / 1_000_000) * pricing["input"]
        output_cost = (output_tokens / 1_000_000) * pricing["output"]
        return round(input_cost + output_cost, 6)

    def log_call(
        self,
        agent_id: str,
        agent_name: str,
        provider: str,
        model: str,
        input_tokens: int = 0,
        output_tokens: int = 0,
        source: str = "api",  # "api" or "oauth"
        task_type: str = "chat",
    ) -> dict:
        cost = self.estimate_cost(provider, model, input_tokens, output_tokens)
        entry = {
            "id": str(uuid.uuid4()),
            "timestamp": datetime.now().isoformat(),
            "agent_id": agent_id,
            "agent_name": agent_name,
            "provider": provider,
            "model": model,
            "input_tokens": input_tokens,
            "output_tokens": output_tokens,
            "cost_usd": cost,
            "source": source,
            "task_type": task_type,
        }
        log = self._load_log()
        log.append(entry)
        self._save_log(log)
        return entry

    def get_today_spend(self) -> float:
        today = datetime.now().strftime("%Y-%m-%d")
        log = self._load_log()
        return sum(e["cost_usd"] for e in log if e["timestamp"].startswith(today))

    def is_over_budget(self) -> bool:
        return self.get_today_spend() >= self.daily_budget

    def get_summary(self, days: int = 30) -> dict:
        cutoff = (datetime.now() - timedelta(days=days)).isoformat()
        log = self._load_log()
        recent = [e for e in log if e["timestamp"] >= cutoff]

        total_cost = sum(e["cost_usd"] for e in recent)
        total_input = sum(e["input_tokens"] for e in recent)
        total_output = sum(e["output_tokens"] for e in recent)
        total_calls = len(recent)

        # Per-agent breakdown
        by_agent: Dict[str, dict] = {}
        for e in recent:
            name = e.get("agent_name", "Unknown")
            if name not in by_agent:
                by_agent[name] = {"calls": 0, "cost": 0.0, "tokens": 0}
            by_agent[name]["calls"] += 1
            by_agent[name]["cost"] += e["cost_usd"]
            by_agent[name]["tokens"] += e["input_tokens"] + e["output_tokens"]

        # Per-provider breakdown
        by_provider: Dict[str, dict] = {}
        for e in recent:
            prov = e.get("provider", "unknown")
            if prov not in by_provider:
                by_provider[prov] = {"calls": 0, "cost": 0.0, "source_api": 0, "source_oauth": 0}
            by_provider[prov]["calls"] += 1
            by_provider[prov]["cost"] += e["cost_usd"]
            if e.get("source") == "api":
                by_provider[prov]["source_api"] += 1
            else:
                by_provider[prov]["source_oauth"] += 1

        # Daily spend over period
        daily: Dict[str, float] = {}
        for e in recent:
            day = e["timestamp"][:10]
            daily[day] = daily.get(day, 0) + e["cost_usd"]

        return {
            "period_days": days,
            "total_cost_usd": round(total_cost, 4),
            "total_calls": total_calls,
            "total_input_tokens": total_input,
            "total_output_tokens": total_output,
            "daily_budget_usd": self.daily_budget,
            "today_spend_usd": round(self.get_today_spend(), 4),
            "budget_remaining_usd": round(max(0, self.daily_budget - self.get_today_spend()), 4),
            "by_agent": [
                {"name": k, **v} for k, v in sorted(by_agent.items(), key=lambda x: -x[1]["cost"])
            ],
            "by_provider": [
                {"provider": k, **v} for k, v in sorted(by_provider.items(), key=lambda x: -x[1]["cost"])
            ],
            "daily_spend": [
                {"date": k, "cost_usd": round(v, 4)} for k, v in sorted(daily.items())
            ],
        }

    def get_recent_calls(self, limit: int = 50) -> List[dict]:
        log = self._load_log()
        return list(reversed(log[-limit:]))

    def get_scorecard(self, days: int = 7) -> dict:
        """Agent value scorecard — maps cost to visible output for ROI tracking."""
        cutoff = (datetime.now() - timedelta(days=days)).isoformat()
        log = self._load_log()
        recent = [e for e in log if e["timestamp"] >= cutoff]

        total_cost = sum(e["cost_usd"] for e in recent)
        total_calls = len(recent)

        by_agent: Dict[str, dict] = {}
        for e in recent:
            name = e.get("agent_name", "Unknown")
            if name not in by_agent:
                by_agent[name] = {
                    "calls": 0,
                    "cost": 0.0,
                    "tasks_completed": 0,
                    "task_types": {},
                }
            by_agent[name]["calls"] += 1
            by_agent[name]["cost"] += e["cost_usd"]
            tt = e.get("task_type", "chat")
            by_agent[name]["task_types"][tt] = by_agent[name]["task_types"].get(tt, 0) + 1
            if tt != "chat":
                by_agent[name]["tasks_completed"] += 1

        agents = []
        for name, data in by_agent.items():
            agents.append({
                "name": name,
                "calls": data["calls"],
                "cost_usd": round(data["cost"], 4),
                "tasks_completed": data["tasks_completed"],
                "task_breakdown": data["task_types"],
            })

        return {
            "period_days": days,
            "total_cost_usd": round(total_cost, 4),
            "total_calls": total_calls,
            "agents": sorted(agents, key=lambda x: -x["cost_usd"]),
        }

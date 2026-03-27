"""Skills — pre-defined and custom multi-step workflows for Master Chat."""

import json
import logging
import os
import re
import uuid
from datetime import datetime
from typing import Optional

from app.config import settings

logger = logging.getLogger(__name__)

DATA_DIR = settings.DATA_DIR
SKILLS_FILE = os.path.join(DATA_DIR, "skills.json")

# --- Built-in Skills ---

BUILT_IN_SKILLS = {
    "deploy_agent": {
        "id": "deploy_agent",
        "name": "deploy_agent",
        "description": "Create a new agent, schedule a recurring job, and run its first execution immediately.",
        "builtin": True,
        "params": ["name", "role", "goal", "backstory", "prompt", "frequency", "time"],
        "steps": [
            {
                "tool_name": "manage_agents",
                "args": {
                    "action": "create",
                    "agent_name": "{param.name}",
                    "role": "{param.role}",
                    "goal": "{param.goal}",
                    "backstory": "{param.backstory}",
                },
            },
            {
                "tool_name": "manage_schedules",
                "args": {
                    "action": "create",
                    "job_name": "{param.name} Daily",
                    "agent_name": "{param.name}",
                    "prompt": "{param.prompt}",
                    "frequency": "{param.frequency}",
                    "time": "{param.time}",
                },
            },
            {
                "tool_name": "run_job_now",
                "args": {"job_name": "{param.name} Daily"},
            },
        ],
    },
    "morning_briefing": {
        "id": "morning_briefing",
        "name": "morning_briefing",
        "description": "Get a complete morning overview: Lab status, recent reports, upcoming schedule, and spending.",
        "builtin": True,
        "params": [],
        "steps": [
            {"tool_name": "get_lab_status", "args": {}},
            {
                "tool_name": "manage_reports",
                "args": {"action": "list", "limit": 5},
            },
            {
                "tool_name": "manage_schedules",
                "args": {"action": "calendar", "days": 3},
            },
            {"tool_name": "get_cost_summary", "args": {"days": 7}},
        ],
    },
    "onboard_knowledge": {
        "id": "onboard_knowledge",
        "name": "onboard_knowledge",
        "description": "Search for existing knowledge on a topic, then add new knowledge entries.",
        "builtin": True,
        "params": ["topic", "title", "content", "category"],
        "steps": [
            {
                "tool_name": "search_knowledge",
                "args": {"query": "{param.topic}"},
            },
            {
                "tool_name": "manage_knowledge",
                "args": {
                    "action": "add",
                    "title": "{param.title}",
                    "content": "{param.content}",
                    "category": "{param.category}",
                },
            },
        ],
    },
    "weekly_audit": {
        "id": "weekly_audit",
        "name": "weekly_audit",
        "description": "Full weekly audit: Lab status, 7-day spending, all reports, and strategy progress.",
        "builtin": True,
        "params": [],
        "steps": [
            {"tool_name": "get_lab_status", "args": {}},
            {"tool_name": "get_cost_summary", "args": {"days": 7}},
            {
                "tool_name": "manage_reports",
                "args": {"action": "list", "limit": 20},
            },
            {
                "tool_name": "manage_strategies",
                "args": {"action": "list"},
            },
        ],
    },
}


class SkillManager:
    """Manages built-in and custom skills with JSON persistence."""

    def __init__(self):
        self._custom: dict = {}
        self._load()

    def _load(self):
        if os.path.isfile(SKILLS_FILE):
            try:
                with open(SKILLS_FILE) as f:
                    self._custom = json.load(f)
            except Exception:
                self._custom = {}

    def _save(self):
        os.makedirs(DATA_DIR, exist_ok=True)
        with open(SKILLS_FILE, "w") as f:
            json.dump(self._custom, f, indent=2)

    def list_all(self) -> list:
        combined = {}
        combined.update(BUILT_IN_SKILLS)
        combined.update(self._custom)
        return list(combined.values())

    def get(self, name: str) -> Optional[dict]:
        if name in BUILT_IN_SKILLS:
            return BUILT_IN_SKILLS[name]
        return self._custom.get(name)

    def create(self, name: str, description: str, steps: list, params: list = None) -> dict:
        skill = {
            "id": name,
            "name": name,
            "description": description,
            "builtin": False,
            "params": params or [],
            "steps": steps,
            "created_at": datetime.utcnow().isoformat(),
        }
        self._custom[name] = skill
        self._save()
        return skill

    def delete(self, name: str) -> bool:
        if name in BUILT_IN_SKILLS:
            return False  # Can't delete built-in
        if name in self._custom:
            del self._custom[name]
            self._save()
            return True
        return False


class SkillExecutor:
    """Executes skill workflows by chaining master_chat._execute_tool calls."""

    def __init__(self, master_chat):
        self.master_chat = master_chat

    async def execute(self, skill_name: str, params: dict = None) -> dict:
        skill_manager = getattr(self.master_chat, "skill_manager", None)
        if not skill_manager:
            return {"skill": skill_name, "error": "Skill manager not available."}

        skill = skill_manager.get(skill_name)
        if not skill:
            available = [s["name"] for s in skill_manager.list_all()]
            return {"skill": skill_name, "error": f"Skill not found. Available: {', '.join(available)}"}

        params = params or {}
        step_results = []
        prev_result = ""

        logger.info(f"Skill [{skill_name}]: starting {len(skill['steps'])} steps with params={list(params.keys())}")

        for i, step in enumerate(skill["steps"]):
            tool_name = step["tool_name"]
            raw_args = step.get("args", {})

            # Template replacement
            resolved_args = {}
            for key, val in raw_args.items():
                if isinstance(val, str):
                    resolved_args[key] = self._resolve_template(val, params, prev_result)
                else:
                    resolved_args[key] = val

            logger.info(f"Skill [{skill_name}] step {i+1}/{len(skill['steps'])}: {tool_name}({resolved_args})")

            try:
                result = await self.master_chat._execute_tool(tool_name, resolved_args)
                prev_result = result
                step_results.append({
                    "step": i + 1,
                    "tool": tool_name,
                    "status": "ok",
                    "result": result,
                })
                logger.info(f"Skill [{skill_name}] step {i+1}: ok ({len(result)} chars)")
            except Exception as e:
                error_msg = f"Step error: {str(e)}"
                step_results.append({
                    "step": i + 1,
                    "tool": tool_name,
                    "status": "error",
                    "result": error_msg,
                })
                logger.warning(f"Skill [{skill_name}] step {i+1}: error — {e}")

        # Build summary
        ok_count = sum(1 for s in step_results if s["status"] == "ok")
        summary_parts = []
        for sr in step_results:
            prefix = "✓" if sr["status"] == "ok" else "✗"
            preview = sr["result"][:200] if sr["result"] else ""
            summary_parts.append(f"**Step {sr['step']}** ({sr['tool']}) {prefix}\n{preview}")

        summary = f"**Skill: {skill_name}** — {ok_count}/{len(step_results)} steps completed\n\n" + "\n\n".join(summary_parts)

        logger.info(f"Skill [{skill_name}]: done — {ok_count}/{len(step_results)} ok")

        return {
            "skill": skill_name,
            "steps": step_results,
            "summary": summary,
            "ok": ok_count,
            "total": len(step_results),
        }

    @staticmethod
    def _resolve_template(template: str, params: dict, prev_result: str) -> str:
        """Replace {param.X} and {prev_result} placeholders."""
        result = template.replace("{prev_result}", prev_result)
        for key, val in params.items():
            result = result.replace(f"{{param.{key}}}", str(val))
        return result

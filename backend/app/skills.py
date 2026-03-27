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
        "description": "Full agent deployment: create agent, add KB context, schedule recurring job, create Notion tracking task, verify with first chat, and confirm schedule saved.",
        "builtin": True,
        "params": ["name", "role", "goal", "backstory", "prompt", "frequency", "time"],
        "defaults": {
            "frequency": "daily",
            "time": "09:00",
            "prompt": "Deliver your daily output based on your role as {param.role} and goal: {param.goal}",
        },
        "steps": [
            {
                "label": "Create agent",
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
                "label": "Add KB context",
                "tool_name": "manage_knowledge",
                "args": {
                    "action": "add",
                    "title": "Agent: {param.name}",
                    "content": "Role: {param.role}. Goal: {param.goal}. Backstory: {param.backstory}. Scheduled prompt: {param.prompt}",
                    "category": "reference",
                },
            },
            {
                "label": "Create schedule",
                "tool_name": "manage_schedules",
                "args": {
                    "action": "create",
                    "job_name": "{param.name} Daily Report",
                    "agent_name": "{param.name}",
                    "prompt": "{param.prompt}",
                    "frequency": "{param.frequency}",
                    "time": "{param.time}",
                },
            },
            {
                "label": "Create Notion tracking task",
                "tool_name": "manage_notion_tasks",
                "args": {
                    "action": "create",
                    "title": "Review {param.name} first output",
                    "agent_name": "{param.name}",
                    "priority": "Medium",
                    "handoff_notes": "Check {param.name}'s first scheduled output for quality and tone.",
                },
            },
            {
                "label": "Verify agent responds",
                "tool_name": "chat_with_agent",
                "args": {
                    "agent_name": "{param.name}",
                    "message": "Introduce yourself and confirm you understand your role: {param.role}. Then give a brief preview of what you'll deliver for your first scheduled task: {param.prompt}",
                },
            },
            {
                "label": "Verify schedule saved",
                "tool_name": "manage_schedules",
                "args": {"action": "list"},
            },
        ],
    },
    "morning_briefing": {
        "id": "morning_briefing",
        "name": "morning_briefing",
        "description": "Daily ops summary: Lab status, today's schedule, latest reports, and spending.",
        "builtin": True,
        "params": [],
        "steps": [
            {"tool_name": "get_lab_status", "args": {}},
            {
                "tool_name": "manage_schedules",
                "args": {"action": "calendar", "days": 1},
            },
            {
                "tool_name": "manage_reports",
                "args": {"action": "list", "limit": 5},
            },
            {"tool_name": "get_cost_summary", "args": {"days": 7}},
        ],
    },
    "onboard_knowledge": {
        "id": "onboard_knowledge",
        "name": "onboard_knowledge",
        "description": "Bulk knowledge import: search existing, add new entries, list agents for assignment, and create correction rules.",
        "builtin": True,
        "params": ["topic", "title", "content", "category", "agent_name", "correction"],
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
            {
                "tool_name": "manage_agents",
                "args": {"action": "list"},
            },
            {
                "tool_name": "add_correction",
                "args": {
                    "agent_name": "{param.agent_name}",
                    "original_response": "Did not use knowledge: {param.title}",
                    "correction": "{param.correction}",
                },
            },
        ],
    },
    "weekly_audit": {
        "id": "weekly_audit",
        "name": "weekly_audit",
        "description": "Full weekly review: Lab status, 7-day costs, all reports, strategy progress, and publish audit to Notion.",
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
            {
                "tool_name": "publish_to_notion",
                "args": {
                    "title": "Weekly Audit",
                    "content": "{prev_result}",
                    "agent_name": "Master Chat",
                    "report_type": "weekly_review",
                },
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

    # Patterns that indicate _execute_tool returned an error (it catches exceptions and returns strings)
    ERROR_PREFIXES = ("Tool error", "Agent '", "Job '", "not found", "not configured", "Failed to", "entry_id is required", "report_id is required", "strategy_id is required", "page_id is required")

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

        # Apply defaults for missing params
        params = dict(params or {})
        defaults = skill.get("defaults", {})
        for key, default_val in defaults.items():
            if key not in params or not params[key]:
                # Default values can themselves contain {param.X} templates
                params[key] = self._resolve_template(default_val, params, "")

        step_results = []
        prev_result = ""

        logger.info(f"Skill [{skill_name}]: starting {len(skill['steps'])} steps with params={list(params.keys())}")

        for i, step in enumerate(skill["steps"]):
            tool_name = step["tool_name"]
            label = step.get("label", tool_name)
            raw_args = step.get("args", {})

            # Template replacement
            resolved_args = {}
            for key, val in raw_args.items():
                if isinstance(val, str):
                    resolved = self._resolve_template(val, params, prev_result)
                    # Detect unreplaced templates — means a required param is missing
                    if "{param." in resolved:
                        import re
                        missing = re.findall(r"\{param\.(\w+)\}", resolved)
                        logger.warning(f"Skill [{skill_name}] step {i+1}: unresolved params {missing} in {key}")
                    resolved_args[key] = resolved
                else:
                    resolved_args[key] = val

            logger.info(f"Skill [{skill_name}] step {i+1}/{len(skill['steps'])} [{label}]: {tool_name}({resolved_args})")

            try:
                result = await self.master_chat._execute_tool(tool_name, resolved_args)

                # Detect tool error strings (not exceptions)
                is_error = self._is_tool_error(result)
                if is_error:
                    prev_result = f"[Step {i+1} ({label}) failed: {result}]"
                    step_results.append({
                        "step": i + 1,
                        "label": label,
                        "tool": tool_name,
                        "status": "error",
                        "result": result,
                    })
                    logger.warning(f"Skill [{skill_name}] step {i+1} [{label}]: tool returned error — {result[:200]}")
                else:
                    prev_result = result
                    step_results.append({
                        "step": i + 1,
                        "label": label,
                        "tool": tool_name,
                        "status": "ok",
                        "result": result,
                    })
                    logger.info(f"Skill [{skill_name}] step {i+1} [{label}]: ok ({len(result)} chars)")
            except Exception as e:
                error_msg = str(e)
                prev_result = f"[Step {i+1} ({label}) exception: {error_msg}]"
                step_results.append({
                    "step": i + 1,
                    "label": label,
                    "tool": tool_name,
                    "status": "error",
                    "result": f"Exception: {error_msg}",
                })
                logger.warning(f"Skill [{skill_name}] step {i+1} [{label}]: exception — {e}")

        # Build summary with clear error reporting
        ok_count = sum(1 for s in step_results if s["status"] == "ok")
        error_count = len(step_results) - ok_count
        summary_parts = []
        for sr in step_results:
            prefix = "✓" if sr["status"] == "ok" else "✗ FAILED"
            label = sr.get("label", sr["tool"])
            preview = sr["result"][:300] if sr["result"] else ""
            summary_parts.append(f"**Step {sr['step']}: {label}** {prefix}\n{preview}")

        status_line = f"**Skill: {skill_name}** — {ok_count}/{len(step_results)} steps succeeded"
        if error_count > 0:
            failed_labels = [sr.get("label", sr["tool"]) for sr in step_results if sr["status"] == "error"]
            status_line += f" | {error_count} FAILED: {', '.join(failed_labels)}"

        summary = status_line + "\n\n" + "\n\n".join(summary_parts)

        logger.info(f"Skill [{skill_name}]: done — {ok_count}/{len(step_results)} ok, {error_count} errors")

        # Broadcast skill completion via WebSocket
        ws_manager = getattr(self.master_chat, "ws_manager", None)
        if ws_manager:
            try:
                await ws_manager.broadcast("skill_completed", {
                    "skill": skill_name,
                    "ok": ok_count,
                    "total": len(step_results),
                    "errors": error_count,
                    "summary": summary[:500],
                })
            except Exception:
                pass

        return {
            "skill": skill_name,
            "steps": step_results,
            "summary": summary,
            "ok": ok_count,
            "total": len(step_results),
            "errors": error_count,
        }

    @classmethod
    def _is_tool_error(cls, result: str) -> bool:
        """Detect if _execute_tool returned an error string instead of raising."""
        if not result:
            return False
        for prefix in cls.ERROR_PREFIXES:
            if result.startswith(prefix):
                return True
        # Also catch the generic pattern
        if "not found" in result.lower() and len(result) < 200:
            return True
        return False

    @staticmethod
    def _resolve_template(template: str, params: dict, prev_result: str) -> str:
        """Replace {param.X} and {prev_result} placeholders."""
        result = template.replace("{prev_result}", prev_result)
        for key, val in params.items():
            result = result.replace(f"{{param.{key}}}", str(val))
        return result

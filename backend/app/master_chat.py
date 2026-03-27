"""Master Chat — AI command centre for The Lab with function calling."""

import json
import logging
import os
import uuid
from datetime import datetime
from typing import Optional

from openai import OpenAI

from app.config import settings

logger = logging.getLogger(__name__)

DATA_DIR = settings.DATA_DIR
CHAT_FILE = os.path.join(DATA_DIR, "master_chat_history.json")
CONFIG_FILE = os.path.join(DATA_DIR, "master_chat_config.json")

SYSTEM_PROMPT = """You are The Lab's Master Chat — the AI command centre that orchestrates everything.

## Your Role
You help the user manage their AI agent operations hub. You have FULL access to create, modify, and delete anything in The Lab — agents, schedules, Notion tasks, knowledge, strategies, and more. Use your tools to execute requests immediately.

## Available Agents
{agent_list}
Plus any custom agents the user has created.

## CRITICAL RULES
1. NEVER say you can't do something when you have a tool for it. You have tools for EVERYTHING listed below.
2. NEVER ask the user to do something manually that you can do with a tool call.
3. When the user asks you to create, modify, or delete anything — USE THE TOOL IMMEDIATELY. Don't explain what you would do. Just do it.
4. If a request requires multiple tools, call them all in one turn.

## Your Capabilities (all available NOW via tools)
You CAN do all of these right now:
- **Create new agents** → manage_agents(action="create", agent_name=..., role=..., goal=..., backstory=...)
- **List/inspect agents** → manage_agents(action="list") or manage_agents(action="get", agent_name=...)
- **View agent chat history** → manage_agents(action="get_history", agent_name=...)
- **Create cron jobs** → manage_schedules(action="create", job_name=..., agent_name=..., prompt=..., frequency=..., time=...)
- **List/delete/toggle schedules** → manage_schedules(action="list|delete|toggle", job_name=...)
- **View past job runs** → manage_schedules(action="executions", job_name=...)
- **View upcoming calendar** → manage_schedules(action="calendar")
- **Run a job immediately** → run_job_now(job_name=...)
- **Create Notion tasks** → manage_notion_tasks(action="create", title=..., agent_name=..., priority=...)
- **List/update Notion tasks** → manage_notion_tasks(action="list_active|list_new|set_status|push_result")
- **Add/update/delete knowledge** → manage_knowledge(action="add|update|delete")
- **Search knowledge** → search_knowledge(query=...)
- **Create/manage strategies** → manage_strategies(action="create|list|update|delete|progress")
- **Publish to Notion** → publish_to_notion(title=..., content=..., agent_name=...)
- **Send work to an agent** → chat_with_agent(agent_name=..., message=...)
- **Correct agent behaviour** → add_correction(agent_name=..., original_response=..., correction=...)
- **Rate job output** → rate_execution(job_name=..., rating=1-5)
- **Check spending** → get_cost_summary(days=7)
- **Get Lab status** → get_lab_status()

## How to Work
- Execute requests immediately with tools. Don't ask for confirmation — just do it and report what you did.
- If the user wants a specialist agent that doesn't exist, create one with manage_agents(action="create"), then use it.
- If the user doesn't specify an agent, choose the best one: Scout for research/leads, Quill for content/writing, Forge for tech, Radar for outreach/sales.
- Chain multiple tools when needed (e.g., create agent → create schedule → run job — all in one turn).
- Always explain what you did and what happened.
- Use British English. Be direct, no fluff.
- Apply Hormozi's priority framework: (1) Revenue (2) Credibility/proof (3) Distribution (4) Product strength.

## Context
{memory_context}
"""

# --- Tool Definitions (OpenAI function calling format) ---

TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "search_knowledge",
            "description": "Search the Lab's knowledge base for relevant information before taking action.",
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {"type": "string", "description": "Search query"}
                },
                "required": ["query"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "chat_with_agent",
            "description": "Send a task to a specific agent and get their response.",
            "parameters": {
                "type": "object",
                "properties": {
                    "agent_name": {"type": "string", "description": "Agent name (e.g. Scout, Quill, Forge, Radar, or any custom agent)"},
                    "message": {"type": "string", "description": "The task or question for the agent"},
                },
                "required": ["agent_name", "message"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "run_job_now",
            "description": "Run a scheduled job immediately.",
            "parameters": {
                "type": "object",
                "properties": {
                    "job_name": {"type": "string", "description": "Name of the scheduled job to run"},
                },
                "required": ["job_name"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_lab_status",
            "description": "Get overall Lab status — agents, reports, schedules, strategies, costs, memory stats.",
            "parameters": {"type": "object", "properties": {}},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "publish_to_notion",
            "description": "Publish a report or content to Notion.",
            "parameters": {
                "type": "object",
                "properties": {
                    "title": {"type": "string", "description": "Report title"},
                    "content": {"type": "string", "description": "Report content (markdown)"},
                    "agent_name": {"type": "string", "description": "Which agent produced this"},
                    "report_type": {"type": "string", "enum": ["briefing", "content", "tech_report", "outreach", "weekly_review"], "description": "Type of report"},
                },
                "required": ["title", "content", "agent_name"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "manage_agents",
            "description": "Manage Lab agents: list all, get details, create new, or view chat history.",
            "parameters": {
                "type": "object",
                "properties": {
                    "action": {"type": "string", "enum": ["list", "get", "create", "get_history"], "description": "What to do"},
                    "agent_name": {"type": "string", "description": "Agent name (for get/create/get_history)"},
                    "role": {"type": "string", "description": "Job title (create only)"},
                    "goal": {"type": "string", "description": "Agent goal (create only)"},
                    "backstory": {"type": "string", "description": "Agent background (create only)"},
                },
                "required": ["action"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "manage_schedules",
            "description": "Manage scheduled jobs: create, list, delete, toggle pause/resume, view past executions, or get upcoming calendar.",
            "parameters": {
                "type": "object",
                "properties": {
                    "action": {"type": "string", "enum": ["create", "list", "delete", "toggle", "executions", "calendar"], "description": "What to do"},
                    "job_name": {"type": "string", "description": "Job name (for create/delete/toggle/executions)"},
                    "agent_name": {"type": "string", "description": "Agent to assign (create only)"},
                    "prompt": {"type": "string", "description": "What the agent should do each run (create only)"},
                    "frequency": {"type": "string", "enum": ["daily", "weekdays", "weekly", "monthly"], "description": "How often (create only)"},
                    "time": {"type": "string", "description": "HH:MM 24h format (create only, default 09:00)"},
                    "days": {"type": "integer", "description": "Calendar lookahead in days (calendar only, default 7)"},
                    "limit": {"type": "integer", "description": "Number of past executions to show (executions only, default 5)"},
                },
                "required": ["action"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "manage_reports",
            "description": "Manage reports: list recent, read full content, delete, star, or unstar.",
            "parameters": {
                "type": "object",
                "properties": {
                    "action": {"type": "string", "enum": ["list", "read", "delete", "star", "unstar"], "description": "What to do"},
                    "agent_name": {"type": "string", "description": "Filter by agent name (list/read)"},
                    "report_id": {"type": "string", "description": "Report ID (for read/delete/star/unstar)"},
                    "limit": {"type": "integer", "description": "Max reports to return (list only, default 5)"},
                },
                "required": ["action"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "manage_knowledge",
            "description": "Manage knowledge base: add new entry, update existing, or delete.",
            "parameters": {
                "type": "object",
                "properties": {
                    "action": {"type": "string", "enum": ["add", "update", "delete"], "description": "What to do"},
                    "entry_id": {"type": "string", "description": "Entry ID (update/delete only)"},
                    "title": {"type": "string", "description": "Entry title (add/update)"},
                    "content": {"type": "string", "description": "Entry content (add/update)"},
                    "category": {"type": "string", "enum": ["rule", "fact", "reference", "preference"], "description": "Category (add only)"},
                },
                "required": ["action"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "manage_strategies",
            "description": "Manage business strategies: create, list, update, delete, or view progress.",
            "parameters": {
                "type": "object",
                "properties": {
                    "action": {"type": "string", "enum": ["create", "list", "update", "delete", "progress"], "description": "What to do"},
                    "strategy_id": {"type": "string", "description": "Strategy ID (update/delete/progress)"},
                    "title": {"type": "string", "description": "Strategy title (create)"},
                    "problem": {"type": "string", "description": "Business problem (create/update)"},
                    "approach": {"type": "string", "description": "How agents will tackle this (create/update)"},
                    "agent_names": {"type": "array", "items": {"type": "string"}, "description": "Agent names to assign (create/update)"},
                    "status": {"type": "string", "enum": ["active", "paused", "completed"], "description": "Status (update only)"},
                },
                "required": ["action"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "manage_notion_tasks",
            "description": "Manage Notion tasks: create new, list active/new, update status, push results, or sync to knowledge base.",
            "parameters": {
                "type": "object",
                "properties": {
                    "action": {"type": "string", "enum": ["create", "list_active", "list_new", "set_status", "push_result", "sync_to_knowledge"], "description": "What to do"},
                    "title": {"type": "string", "description": "Task title (create only)"},
                    "agent_name": {"type": "string", "description": "Assign to agent (create only)"},
                    "priority": {"type": "string", "enum": ["Low", "Medium", "High", "Urgent"], "description": "Priority (create only, default Medium)"},
                    "project": {"type": "string", "description": "Project name (create only)"},
                    "handoff_notes": {"type": "string", "description": "Context/instructions (create only)"},
                    "page_id": {"type": "string", "description": "Notion page ID (set_status/push_result/sync_to_knowledge)"},
                    "status": {"type": "string", "description": "New status value (set_status only)"},
                    "result_text": {"type": "string", "description": "Result to push (push_result only)"},
                },
                "required": ["action"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "add_correction",
            "description": "Record a correction for an agent's behaviour. If the same correction appears twice, it auto-promotes to a permanent rule.",
            "parameters": {
                "type": "object",
                "properties": {
                    "agent_name": {"type": "string", "description": "Agent to correct"},
                    "original_response": {"type": "string", "description": "What the agent said/did wrong"},
                    "correction": {"type": "string", "description": "What it should have said/done instead"},
                },
                "required": ["agent_name", "original_response", "correction"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_cost_summary",
            "description": "Get API spending summary: total cost, per-agent breakdown, budget status.",
            "parameters": {
                "type": "object",
                "properties": {
                    "days": {"type": "integer", "description": "Lookback period in days (default 7)"},
                },
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "rate_execution",
            "description": "Rate a scheduled job's last execution 1-5 stars. Poor ratings (1-2) auto-create corrections for the agent.",
            "parameters": {
                "type": "object",
                "properties": {
                    "job_name": {"type": "string", "description": "Job name to rate"},
                    "rating": {"type": "integer", "description": "Rating 1-5 (1=terrible, 5=excellent)"},
                    "feedback": {"type": "string", "description": "What was wrong or could be better"},
                },
                "required": ["job_name", "rating"],
            },
        },
    },
]


class MasterChat:
    """Orchestrates The Lab via LLM function calling."""

    def __init__(self, agent_manager, scheduler_manager, strategy_manager,
                 report_manager, knowledge_manager, agent_memory_manager,
                 correction_manager, cost_tracker, notion_bridge=None, ws_manager=None):
        self.agent_manager = agent_manager
        self.scheduler_manager = scheduler_manager
        self.strategy_manager = strategy_manager
        self.report_manager = report_manager
        self.knowledge_manager = knowledge_manager
        self.agent_memory_manager = agent_memory_manager
        self.correction_manager = correction_manager
        self.cost_tracker = cost_tracker
        self.notion_bridge = notion_bridge
        self.ws_manager = ws_manager

    # --- Config ---

    def get_config(self) -> dict:
        default = {"provider": "openai", "model_name": "gpt-5.4"}
        if os.path.isfile(CONFIG_FILE):
            try:
                with open(CONFIG_FILE) as f:
                    config = json.load(f)
                # Auto-fix stale gpt-4o config that causes 502
                if config.get("model_name") == "gpt-4o":
                    config["model_name"] = "gpt-5.4"
                    self.update_config(config)
                return config
            except Exception:
                return default
        return default

    def update_config(self, data: dict) -> dict:
        config = self.get_config()
        config.update(data)
        with open(CONFIG_FILE, "w") as f:
            json.dump(config, f, indent=2)
        return config

    # --- Chat History ---

    def get_history(self) -> list:
        if os.path.isfile(CHAT_FILE):
            with open(CHAT_FILE) as f:
                return json.load(f)
        return []

    def _save_message(self, role: str, content: str):
        history = self.get_history()
        history.append({
            "id": str(uuid.uuid4()),
            "role": role,
            "content": content,
            "timestamp": datetime.utcnow().isoformat(),
        })
        # Keep last 100 messages
        if len(history) > 100:
            history = history[-100:]
        with open(CHAT_FILE, "w") as f:
            json.dump(history, f, indent=2)

    def clear_history(self):
        if os.path.isfile(CHAT_FILE):
            os.remove(CHAT_FILE)

    # --- Agent name resolution ---

    def _resolve_agent(self, name: str):
        """Find agent by name (case-insensitive)."""
        for agent in self.agent_manager.list_agents():
            if agent.name.lower() == name.lower():
                return agent
        return None

    def _resolve_agent_by_id(self, agent_id: str):
        """Find agent by ID."""
        return self.agent_manager.get_agent(agent_id)

    def _resolve_job(self, name: str):
        """Find scheduled job by name (case-insensitive, partial match)."""
        name_lower = name.lower()
        for job in self.scheduler_manager.list_jobs():
            if name_lower in job.get("name", "").lower():
                return job
        return None

    # --- Tool Execution ---

    async def _execute_tool(self, tool_name: str, args: dict) -> str:
        """Execute a tool call and return the result as a string."""
        try:
            # --- Kept tools (unchanged logic) ---

            if tool_name == "search_knowledge":
                results = self.knowledge_manager.get_all(search=args["query"])
                if not results:
                    return "No knowledge entries found for that query."
                return json.dumps([{"title": r.title, "content": r.content[:200]} for r in results[:5]], indent=2)

            elif tool_name == "chat_with_agent":
                agent = self._resolve_agent(args["agent_name"])
                if not agent:
                    return f"Agent '{args['agent_name']}' not found. Use manage_agents with action=list to see available agents."
                task_preview = args["message"][:50]
                self.agent_manager.update_status(agent.id, "working", f"Master Chat: {task_preview}")
                if self.ws_manager:
                    await self.ws_manager.broadcast("agent_status", {
                        **agent.model_dump(mode="json"),
                        "status": "working",
                        "current_task": f"Master Chat: {task_preview}",
                    })
                response = await self.agent_manager.chat_async(agent.id, args["message"])
                self.agent_manager.update_status(agent.id, "idle", None)
                if self.ws_manager:
                    await self.ws_manager.broadcast("agent_status", {
                        **agent.model_dump(mode="json"),
                        "status": "idle",
                        "current_task": None,
                    })
                    await self.ws_manager.broadcast("task_completed", {
                        "agent_id": agent.id,
                        "agent_name": agent.name,
                        "task": "Master Chat task",
                        "result": response[:100],
                    })
                return response

            elif tool_name == "run_job_now":
                job = self._resolve_job(args["job_name"])
                if not job:
                    return f"Job '{args['job_name']}' not found. Use manage_schedules with action=list to see available jobs."
                import asyncio
                result = await asyncio.to_thread(self.scheduler_manager.run_job_now, job["id"])
                preview = str(result)[:500] if result else "Job completed (no output)."
                return f"Job '{job['name']}' executed. Result:\n{preview}"

            elif tool_name == "get_lab_status":
                agents = self.agent_manager.list_agents()
                reports = self.report_manager.list_reports(limit=1000)
                jobs = self.scheduler_manager.list_jobs()
                strategies = self.strategy_manager.list_all()
                active_strats = [s for s in strategies if s.get("status") == "active"]
                cost = self.cost_tracker.get_summary(days=7)
                status_lines = [
                    f"**Agents:** {len(agents)} ({', '.join(a.name for a in agents)})",
                    f"**Reports:** {len(reports)} total",
                    f"**Scheduled Jobs:** {len(jobs)} ({sum(1 for j in jobs if j.get('enabled'))} enabled)",
                    f"**Strategies:** {len(strategies)} ({len(active_strats)} active)",
                    f"**Spend (7d):** ${cost['total_cost_usd']:.4f} | Today: ${cost['today_spend_usd']:.4f} / ${cost['daily_budget_usd']:.2f} budget",
                ]
                return "\n".join(status_lines)

            elif tool_name == "publish_to_notion":
                if not self.notion_bridge:
                    return "Notion is not configured. Set NOTION_API_KEY and NOTION_DATABASE_ID in .env."
                url = await self.notion_bridge.publish_report(
                    title=args["title"],
                    content=args["content"],
                    agent_name=args.get("agent_name", "Master Chat"),
                    report_type=args.get("report_type", "briefing"),
                    source="master_chat",
                )
                if url:
                    return f"Published to Notion: {url}"
                return "Failed to publish to Notion. Check API key configuration."

            # --- Compound tools ---

            elif tool_name == "manage_agents":
                action = args["action"]

                if action == "list":
                    agents = self.agent_manager.list_agents()
                    if not agents:
                        return "No agents found."
                    lines = []
                    for a in agents:
                        lines.append(f"- **{a.name}** — {a.role} [{a.status}]")
                    return "\n".join(lines)

                elif action == "get":
                    agent = self._resolve_agent(args.get("agent_name", ""))
                    if not agent:
                        return f"Agent '{args.get('agent_name', '')}' not found."
                    return (
                        f"**{agent.name}** — {agent.role}\n"
                        f"Goal: {agent.goal}\n"
                        f"Status: {agent.status}\n"
                        f"Provider: {agent.provider} / {agent.model_name}\n"
                        f"ID: {agent.id}"
                    )

                elif action == "create":
                    from app.models import AgentCreate
                    agent_data = AgentCreate(
                        name=args["agent_name"],
                        role=args["role"],
                        goal=args["goal"],
                        backstory=args["backstory"],
                        provider="openai",
                        model_name="gpt-5.4",
                    )
                    new_agent = self.agent_manager.create_agent(agent_data)
                    if self.ws_manager:
                        await self.ws_manager.broadcast("agent_created", new_agent.model_dump(mode="json"))
                    return f"Agent created: **{new_agent.name}** — {new_agent.role}. ID: {new_agent.id}"

                elif action == "get_history":
                    agent = self._resolve_agent(args.get("agent_name", ""))
                    if not agent:
                        return f"Agent '{args.get('agent_name', '')}' not found."
                    history = self.agent_manager.get_chat_history(agent.id)
                    if not history:
                        return f"No chat history for {agent.name}."
                    lines = []
                    for msg in history[-10:]:
                        role = msg.get("role", "?").capitalize()
                        content = msg.get("content", "")[:200]
                        lines.append(f"**{role}:** {content}")
                    return "\n".join(lines)

                return f"Unknown manage_agents action: {action}"

            elif tool_name == "manage_schedules":
                action = args["action"]

                if action == "create":
                    agent = self._resolve_agent(args.get("agent_name", ""))
                    if not agent:
                        return f"Agent '{args.get('agent_name', '')}' not found."
                    from app.models import ScheduledJobCreateSimple
                    job_data = ScheduledJobCreateSimple(
                        name=args["job_name"],
                        description=args.get("job_name", ""),
                        frequency=args.get("frequency", "daily"),
                        time=args.get("time", "09:00"),
                        prompt=args["prompt"],
                        agent_id=agent.id,
                    )
                    job = self.scheduler_manager.add_job_simple(job_data)
                    return f"Schedule created: '{args['job_name']}' — {args.get('frequency', 'daily')} at {args.get('time', '09:00')} with {agent.name}. Job ID: {job.id}"

                elif action == "list":
                    jobs = self.scheduler_manager.list_jobs()
                    if not jobs:
                        return "No scheduled jobs found."
                    lines = []
                    for j in jobs:
                        agent = self._resolve_agent_by_id(j.get("agent_id", ""))
                        agent_name = agent.name if agent else "Unknown"
                        status = "enabled" if j.get("enabled") else "paused"
                        lines.append(f"- **{j['name']}** — {agent_name}, {j.get('human_schedule', j.get('cron_expression', ''))}, {status}")
                    return "\n".join(lines)

                elif action == "delete":
                    job = self._resolve_job(args.get("job_name", ""))
                    if not job:
                        return f"Job '{args.get('job_name', '')}' not found."
                    self.scheduler_manager.remove_job(job["id"])
                    return f"Schedule '{job['name']}' deleted."

                elif action == "toggle":
                    job = self._resolve_job(args.get("job_name", ""))
                    if not job:
                        return f"Job '{args.get('job_name', '')}' not found."
                    self.scheduler_manager.toggle_job(job["id"])
                    new_state = "paused" if job.get("enabled") else "resumed"
                    return f"Job '{job['name']}' {new_state}."

                elif action == "executions":
                    job = self._resolve_job(args.get("job_name", ""))
                    if not job:
                        return f"Job '{args.get('job_name', '')}' not found."
                    limit = args.get("limit", 5)
                    execs = self.scheduler_manager.get_executions(job["id"], limit=limit)
                    if not execs:
                        return f"No executions found for '{job['name']}'."
                    lines = []
                    for ex in execs:
                        rating = f" ({'*' * ex.rating})" if ex.rating else ""
                        lines.append(f"- {str(ex.started_at)[:16]} — {ex.status}{rating}")
                    return f"**{job['name']}** — last {len(execs)} executions:\n" + "\n".join(lines)

                elif action == "calendar":
                    days = args.get("days", 7)
                    calendar = self.scheduler_manager.get_calendar(days=days)
                    if not calendar:
                        return f"No scheduled runs in the next {days} days."
                    lines = []
                    for entry in calendar[:20]:
                        agent = self._resolve_agent_by_id(entry.get("agent_id", ""))
                        agent_name = agent.name if agent else "Unknown"
                        lines.append(f"- {entry.get('date', '?')} {entry.get('time', '?')} — **{entry.get('job_name', '?')}** ({agent_name})")
                    return f"**Upcoming schedule ({days} days):**\n" + "\n".join(lines)

                return f"Unknown manage_schedules action: {action}"

            elif tool_name == "manage_reports":
                action = args["action"]

                if action == "list":
                    agent_name = args.get("agent_name")
                    limit = args.get("limit", 5)
                    reports = self.report_manager.list_reports(agent_name=agent_name, limit=limit)
                    if not reports:
                        return "No reports found."
                    lines = []
                    for r in reports[:limit]:
                        star = " ⭐" if r.starred else ""
                        lines.append(f"- **{r.title}** ({r.agent_name}, {r.report_type}) — {str(r.created_at)[:10]}{star} [ID: {r.id}]")
                    return "\n".join(lines)

                elif action == "read":
                    if args.get("report_id"):
                        r = self.report_manager.get_report(args["report_id"])
                    else:
                        agent_name = args.get("agent_name")
                        reports = self.report_manager.list_reports(agent_name=agent_name, limit=1)
                        r = reports[0] if reports else None
                    if not r:
                        return "Report not found."
                    content = r.content[:2000] if len(r.content) > 2000 else r.content
                    return f"**{r.title}** ({r.agent_name}, {r.report_type})\n{str(r.created_at)[:10]}\n\n{content}"

                elif action == "delete":
                    if not args.get("report_id"):
                        return "report_id is required for delete."
                    result = self.report_manager.delete_report(args["report_id"])
                    return "Report deleted." if result else "Report not found."

                elif action == "star":
                    if not args.get("report_id"):
                        return "report_id is required for star."
                    self.report_manager.update_report(args["report_id"], {"starred": True})
                    return "Report starred."

                elif action == "unstar":
                    if not args.get("report_id"):
                        return "report_id is required for unstar."
                    self.report_manager.update_report(args["report_id"], {"starred": False})
                    return "Report unstarred."

                return f"Unknown manage_reports action: {action}"

            elif tool_name == "manage_knowledge":
                action = args["action"]

                if action == "add":
                    from app.models import KnowledgeCreate
                    entry = await self.knowledge_manager.add(KnowledgeCreate(
                        title=args["title"],
                        content=args["content"],
                        category=args.get("category", "fact"),
                        tags=[],
                    ))
                    return f"Knowledge added: '{args['title']}' ({args.get('category', 'fact')})"

                elif action == "update":
                    if not args.get("entry_id"):
                        return "entry_id is required for update."
                    updates = {}
                    if args.get("title"):
                        updates["title"] = args["title"]
                    if args.get("content"):
                        updates["content"] = args["content"]
                    result = await self.knowledge_manager.update(args["entry_id"], updates)
                    return "Knowledge entry updated." if result else "Entry not found."

                elif action == "delete":
                    if not args.get("entry_id"):
                        return "entry_id is required for delete."
                    result = self.knowledge_manager.delete(args["entry_id"])
                    return "Knowledge entry deleted." if result else "Entry not found."

                return f"Unknown manage_knowledge action: {action}"

            elif tool_name == "manage_strategies":
                action = args["action"]

                if action == "create":
                    agent_ids = []
                    for name in args.get("agent_names", []):
                        agent = self._resolve_agent(name)
                        if agent:
                            agent_ids.append(agent.id)
                    strategy = self.strategy_manager.create({
                        "title": args["title"],
                        "problem": args.get("problem", ""),
                        "approach": args.get("approach", ""),
                        "agent_ids": agent_ids,
                    })
                    return f"Strategy created: '{strategy['title']}' with {len(agent_ids)} agent(s) assigned."

                elif action == "list":
                    strategies = self.strategy_manager.list_all()
                    if not strategies:
                        return "No strategies found."
                    lines = []
                    for s in strategies:
                        agent_names = []
                        for aid in s.get("agent_ids", []):
                            a = self._resolve_agent_by_id(aid)
                            if a:
                                agent_names.append(a.name)
                        status = s.get("status", "active").capitalize()
                        lines.append(f"- **{s['title']}** [{status}] — {', '.join(agent_names) or 'No agents'} [ID: {s['id']}]")
                        if s.get("problem"):
                            lines.append(f"  Problem: {s['problem'][:100]}")
                    return "\n".join(lines)

                elif action == "update":
                    if not args.get("strategy_id"):
                        return "strategy_id is required for update."
                    updates = {}
                    if args.get("problem"):
                        updates["problem"] = args["problem"]
                    if args.get("approach"):
                        updates["approach"] = args["approach"]
                    if args.get("status"):
                        updates["status"] = args["status"]
                    if args.get("agent_names"):
                        agent_ids = []
                        for name in args["agent_names"]:
                            agent = self._resolve_agent(name)
                            if agent:
                                agent_ids.append(agent.id)
                        updates["agent_ids"] = agent_ids
                    result = self.strategy_manager.update(args["strategy_id"], updates)
                    return "Strategy updated." if result else "Strategy not found."

                elif action == "delete":
                    if not args.get("strategy_id"):
                        return "strategy_id is required for delete."
                    result = self.strategy_manager.delete(args["strategy_id"])
                    return "Strategy deleted." if result else "Strategy not found."

                elif action == "progress":
                    if not args.get("strategy_id"):
                        return "strategy_id is required for progress."
                    progress = self.strategy_manager.get_progress(
                        args["strategy_id"],
                        self.report_manager,
                        self.scheduler_manager,
                        self.cost_tracker,
                    )
                    if not progress:
                        return "Strategy not found."
                    lines = [
                        f"**Reports:** {progress.get('reports_count', 0)} total ({progress.get('reports_this_week', 0)} this week)",
                        f"**Executions:** {progress.get('executions_total', 0)} ({progress.get('executions_successful', 0)} successful)",
                        f"**Agents:** {progress.get('agent_count', 0)}",
                        f"**Schedules:** {progress.get('schedule_count', 0)}",
                    ]
                    return "\n".join(lines)

                return f"Unknown manage_strategies action: {action}"

            elif tool_name == "manage_notion_tasks":
                action = args["action"]
                if not self.notion_bridge:
                    return "Notion is not configured. Set NOTION_API_KEY and NOTION_DATABASE_ID in .env."

                if action == "create":
                    task = await self.notion_bridge.create_task(
                        title=args.get("title", "Untitled Task"),
                        agent_name=args.get("agent_name", ""),
                        priority=args.get("priority", "Medium"),
                        project=args.get("project", ""),
                        handoff_notes=args.get("handoff_notes", ""),
                    )
                    if task:
                        return f"Notion task created: **{task['title']}** — {task.get('url', 'No URL')}"
                    return "Failed to create Notion task. Check API configuration."

                elif action == "list_active":
                    tasks = await self.notion_bridge.pull_all_active_tasks()
                    if not tasks:
                        return "No active tasks in Notion."
                    lines = []
                    for t in tasks:
                        lines.append(f"- **{t['title']}** [{t['status']}] {t.get('priority', '')} — Agent: {t.get('agent', 'Unassigned')} [ID: {t['notion_page_id']}]")
                    return "\n".join(lines)

                elif action == "list_new":
                    tasks = await self.notion_bridge.pull_new_tasks()
                    if not tasks:
                        return "No new tasks in Notion."
                    lines = []
                    for t in tasks:
                        lines.append(f"- **{t['title']}** [{t['status']}] {t.get('priority', '')} — {t.get('handoff_notes', '')[:80]} [ID: {t['notion_page_id']}]")
                    return "\n".join(lines)

                elif action == "set_status":
                    if not args.get("page_id"):
                        return "page_id is required for set_status."
                    result = await self.notion_bridge.set_status(args["page_id"], args.get("status", "In Progress"))
                    return f"Task status updated to '{args.get('status', 'In Progress')}'." if result else "Failed to update status."

                elif action == "push_result":
                    if not args.get("page_id") or not args.get("result_text"):
                        return "page_id and result_text are required for push_result."
                    result = await self.notion_bridge.push_result(
                        args["page_id"],
                        args["result_text"],
                        agent_name=args.get("agent_name"),
                    )
                    return "Result pushed to Notion task." if result else "Failed to push result."

                elif action == "sync_to_knowledge":
                    if not args.get("page_id"):
                        return "page_id is required for sync_to_knowledge."
                    result = await self.notion_bridge.sync_page_to_knowledge(args["page_id"], self.knowledge_manager)
                    if result:
                        return f"Synced to knowledge base: '{result.get('title', '')}' ({result.get('action', '')})"
                    return "Failed to sync from Notion."

                return f"Unknown manage_notion_tasks action: {action}"

            # --- New single-purpose tools ---

            elif tool_name == "add_correction":
                agent = self._resolve_agent(args["agent_name"])
                if not agent:
                    return f"Agent '{args['agent_name']}' not found."
                from app.models import CorrectionCreate
                correction = await self.correction_manager.add(CorrectionCreate(
                    agent_id=agent.id,
                    original_response=args["original_response"],
                    correction=args["correction"],
                ))
                promoted = " (auto-promoted to rule!)" if correction.occurrence_count >= 2 else ""
                return f"Correction recorded for {agent.name}{promoted}: {args['correction'][:100]}"

            elif tool_name == "get_cost_summary":
                days = args.get("days", 7)
                summary = self.cost_tracker.get_summary(days=days)
                lines = [
                    f"**Spend ({days}d):** ${summary['total_cost_usd']:.4f} across {summary['total_calls']} calls",
                    f"**Today:** ${summary['today_spend_usd']:.4f} / ${summary['daily_budget_usd']:.2f} budget (${summary['budget_remaining_usd']:.2f} remaining)",
                    f"**Tokens:** {summary['total_input_tokens']:,} in + {summary['total_output_tokens']:,} out",
                ]
                if summary.get("by_agent"):
                    lines.append("**Per agent:**")
                    for a in summary["by_agent"]:
                        lines.append(f"  - {a['name']}: ${a['cost']:.4f} ({a['calls']} calls)")
                return "\n".join(lines)

            elif tool_name == "rate_execution":
                job = self._resolve_job(args["job_name"])
                if not job:
                    return f"Job '{args['job_name']}' not found."
                execs = self.scheduler_manager.get_executions(job["id"], limit=1)
                if not execs:
                    return f"No executions found for '{job['name']}'."
                latest = execs[0]
                result = await self.scheduler_manager.update_execution_feedback(
                    job["id"], latest.id,
                    rating=args["rating"],
                    feedback=args.get("feedback", ""),
                )
                auto_correction = " Auto-correction created for the agent." if args["rating"] <= 2 else ""
                return f"Rated '{job['name']}' execution: {'⭐' * args['rating']}{auto_correction}"

            else:
                return f"Unknown tool: {tool_name}"

        except Exception as e:
            return f"Tool error ({tool_name}): {str(e)}"

    # --- Main Chat ---

    async def chat(self, user_message: str) -> str:
        """Process a user message with function calling."""
        config = self.get_config()
        provider = config.get("provider", "openai")
        model = config.get("model_name", "gpt-5.4")

        # Build memory context
        memory_context = ""
        try:
            from app.memory_engine import build_context
            memory_context = await build_context(
                "master_chat", user_message,
                self.knowledge_manager, self.agent_memory_manager,
                self.correction_manager,
            )
        except Exception:
            pass

        # Build dynamic agent list
        agents = self.agent_manager.list_agents()
        agent_list = "\n".join(f"- **{a.name}** — {a.role}" for a in agents)
        system_prompt = SYSTEM_PROMPT.replace("{agent_list}", agent_list or "No agents configured yet.")
        system_prompt = system_prompt.replace("{memory_context}", memory_context or "No memory context available.")

        # Build conversation messages (last 20 for context)
        history = self.get_history()
        messages = [{"role": "system", "content": system_prompt}]
        for msg in history[-20:]:
            messages.append({"role": msg["role"], "content": msg["content"]})
        messages.append({"role": "user", "content": user_message})

        # Save user message
        self._save_message("user", user_message)

        # Call LLM
        try:
            logger.info(f"Master Chat: provider={provider}, model={model}, tools={len(TOOLS)}, history={len(history)}")

            if provider == "openai":
                client = OpenAI(api_key=settings.OPENAI_API_KEY, base_url=settings.OPENAI_BASE_URL)
            elif provider == "anthropic":
                # Anthropic tool use via openai-compatible endpoint not supported
                # Fall back to openai for now, or use langchain
                client = OpenAI(api_key=settings.OPENAI_API_KEY, base_url=settings.OPENAI_BASE_URL)
            else:
                client = OpenAI(api_key="ollama", base_url=settings.OLLAMA_BASE_URL + "/v1")

            response = client.chat.completions.create(
                model=model,
                messages=messages,
                tools=TOOLS,
                tool_choice="auto",
            )

            assistant_msg = response.choices[0].message

            # Handle tool calls
            if assistant_msg.tool_calls:
                logger.info(f"Master Chat: GPT called {len(assistant_msg.tool_calls)} tools: {[tc.function.name for tc in assistant_msg.tool_calls]}")
                # Execute each tool
                tool_results = []
                for tool_call in assistant_msg.tool_calls:
                    fn_name = tool_call.function.name
                    fn_args = json.loads(tool_call.function.arguments)
                    logger.info(f"Master Chat: executing {fn_name}({json.dumps(fn_args)[:200]})")
                    result = await self._execute_tool(fn_name, fn_args)
                    logger.info(f"Master Chat: {fn_name} result: {result[:200]}")
                    tool_results.append({
                        "tool_call_id": tool_call.id,
                        "role": "tool",
                        "content": result,
                    })

                # Send tool results back for final response
                messages.append(assistant_msg.model_dump())
                messages.extend(tool_results)

                final_response = client.chat.completions.create(
                    model=model,
                    messages=messages,
                )
                final_text = final_response.choices[0].message.content or ""

                # Log cost
                total_input = (response.usage.prompt_tokens if response.usage else 0) + \
                              (final_response.usage.prompt_tokens if final_response.usage else 0)
                total_output = (response.usage.completion_tokens if response.usage else 0) + \
                               (final_response.usage.completion_tokens if final_response.usage else 0)
                self.cost_tracker.log_call(
                    agent_id="master_chat", agent_name="Master Chat",
                    provider=provider, model=model,
                    input_tokens=total_input, output_tokens=total_output,
                    source="master_chat", task_type="orchestration",
                )
            else:
                logger.info(f"Master Chat: GPT returned text only (no tool calls). Preview: {(assistant_msg.content or '')[:150]}")
                final_text = assistant_msg.content or ""
                if response.usage:
                    self.cost_tracker.log_call(
                        agent_id="master_chat", agent_name="Master Chat",
                        provider=provider, model=model,
                        input_tokens=response.usage.prompt_tokens,
                        output_tokens=response.usage.completion_tokens,
                        source="master_chat", task_type="chat",
                    )

            # Save assistant response
            self._save_message("assistant", final_text)

            return final_text

        except Exception as e:
            error_msg = f"Master Chat error: {str(e)}"
            self._save_message("assistant", error_msg)
            return error_msg

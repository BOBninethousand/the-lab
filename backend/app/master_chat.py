"""Master Chat — AI command centre for The Lab with function calling."""

import json
import logging
import os
import uuid
from datetime import datetime, timezone
from typing import Optional

from openai import OpenAI

from app.config import settings
from app.tools.hdl_tools import (
    submit_health_assessment, submit_longevity_assessment,
    check_user_status, reset_credits, ssh_diagnostics,
)
from app.tools.hdl_form_builders import build_health_form_data, build_longevity_form_data

logger = logging.getLogger(__name__)

HDL_PERSONAS_DIR = os.path.join(os.path.dirname(__file__), "data", "hdl_personas")

DATA_DIR = settings.DATA_DIR
CHAT_FILE = os.path.join(DATA_DIR, "master_chat_history.json")
CONFIG_FILE = os.path.join(DATA_DIR, "master_chat_config.json")

# Shared keyword list for action detection (DRY — used in both chat methods)
ACTION_KEYWORDS = [
    "create", "make", "add", "set up", "schedule", "delete", "remove",
    "run", "execute", "deploy", "publish", "correct", "rate",
    "update", "toggle", "pause", "resume",
    "list agents", "list schedule", "list strat", "list report", "list skill",
    "how much", "spending", "cost", "star", "unstar",
    "skill", "briefing", "audit", "onboard",
    "collaborate", "together", "strategy",
    "health", "longevity", "hdl", "credits", "diagnostics", "persona",
]


def _tool_summary(fn_name: str, fn_args: dict) -> str:
    """Human-readable one-liner with emoji for a tool call badge."""
    agent = fn_args.get("agent_name", "")
    action = fn_args.get("action", "")
    persona = fn_args.get("persona_name", "")
    summaries = {
        "chat_with_agent": f"\U0001f4ac {agent}" if agent else "\U0001f4ac Agent chat",
        "collaborate": "\U0001f465 Collaboration" + (f" with {', '.join(a.get('agent_name', '') for a in fn_args.get('agents', []))}" if fn_args.get("agents") else ""),
        "search_knowledge": "\U0001f50d Knowledge search",
        "publish_to_notion": "\U0001f4dd Published to Notion",
        "submit_health_check": f"\U0001f3e5 Health check: {persona}" if persona else "\U0001f3e5 Health check",
        "submit_longevity_check": f"\U0001f9ec Longevity check: {persona}" if persona else "\U0001f9ec Longevity check",
        "check_hdl_status": "\U0001f4ca HDL status check",
        "reset_hdl_credits": "\U0001f4b3 Credits reset",
        "run_hdl_diagnostics": "\U0001f527 HDL diagnostics",
        "get_lab_status": "\U0001f4ca Lab status",
        "manage_agents": f"\u2699\ufe0f Agents: {action}",
        "manage_schedules": f"\U0001f4c5 Schedules: {action}",
        "manage_reports": f"\U0001f4c4 Reports: {action}",
        "manage_knowledge": f"\U0001f9e0 Knowledge: {action}",
        "manage_strategies": f"\U0001f3af Strategies: {action}",
        "manage_notion_tasks": f"\U0001f4cb Notion tasks: {action}",
        "manage_skills": f"\U0001f527 Skills: {action}",
        "execute_skill": f"\U0001f527 Skill: {fn_args.get('skill_name', '')}",
        "execute_strategy": "\U0001f3af Strategy execution",
        "run_job_now": f"\u25b6\ufe0f Ran job",
        "add_correction": f"\U0001f4dd Correction for {agent}" if agent else "\U0001f4dd Correction",
        "get_cost_summary": "\U0001f4b0 Cost summary",
        "rate_execution": f"\u2b50 Rated execution",
    }
    return summaries.get(fn_name, f"\u2699\ufe0f {fn_name.replace('_', ' ').title()}")


def _describe_tool_action(fn_name: str, fn_args: dict) -> str:
    """Human-readable progress description for a tool about to execute."""
    descriptions = {
        "chat_with_agent": f"Routing to {fn_args.get('agent_name', 'agent')}...",
        "collaborate": "Starting multi-agent collaboration...",
        "search_knowledge": "Searching knowledge base...",
        "publish_to_notion": "Publishing to Notion...",
        "submit_health_check": f"Submitting health check for {fn_args.get('persona_name', 'patient')}...",
        "submit_longevity_check": "Submitting longevity check...",
        "check_hdl_status": "Checking HDL status...",
        "get_lab_status": "Getting Lab status...",
        "manage_agents": f"{fn_args.get('action', 'Managing').title()} agents...",
        "manage_schedules": f"{fn_args.get('action', 'Managing').title()} schedules...",
        "execute_skill": f"Executing skill: {fn_args.get('skill_name', '')}...",
        "execute_strategy": "Executing strategy...",
        "get_cost_summary": "Calculating costs...",
        "manage_reports": f"{fn_args.get('action', 'Managing').title()} reports...",
        "manage_knowledge": f"{fn_args.get('action', 'Managing').title()} knowledge...",
        "manage_strategies": f"{fn_args.get('action', 'Managing').title()} strategies...",
        "manage_notion_tasks": f"{fn_args.get('action', 'Managing').replace('_', ' ').title()} Notion tasks...",
        "manage_skills": f"{fn_args.get('action', 'Managing').title()} skills...",
        "add_correction": f"Adding correction for {fn_args.get('agent_name', 'agent')}...",
        "rate_execution": f"Rating execution...",
        "run_job_now": f"Running {fn_args.get('job_name', 'job')}...",
    }
    return descriptions.get(fn_name, f"Running {fn_name.replace('_', ' ')}...")


SYSTEM_PROMPT = """You are Master Chat — The Lab's AI command centre. You orchestrate agents and tools to complete any task.

## HOW YOU THINK

1. **Plan first.** Before calling any tools, briefly state your plan. What do you need to find out? Which tools will you use? Which agents should be involved?

2. **Act step by step.** Call the tools you need. After each round of results, assess: "Did I get what I needed? Do I need to dig deeper?" If yes, call more tools. Don't stop halfway.

3. **Verify your work.** After making changes (creating agents, modifying schedules, submitting forms), call a verification tool to confirm it worked. Don't assume success.

4. **Report what you DID, not what you WILL do.** Never say "I'll report back" or "I'll check on that" — you must actually do it NOW using tools, then report the results. The user cannot wait for you to come back later. Everything must happen in this conversation turn.

5. **Be specific.** Don't say "I checked the schedules." Say "I found 10 scheduled jobs: Scout runs weekdays at 09:00, Agent Bob runs Mondays at 10:00..." Give concrete data.

## TOOL USAGE RULES

- When a request requires multiple tools, use them ALL. Don't stop after the first one.
- When you use agents, ALWAYS mention which agents you used: "**Agents used:** Scout, Quill"
- When you create or modify something, verify it with a follow-up tool call.
- When collaborating agents, show each agent's contribution with their name in bold.
- If a tool returns an error, explain what went wrong and try an alternative approach.
- NEVER promise future action — act NOW or explain why you can't.
- When publishing to Notion, include the agents used in the report metadata via the agents_used parameter.
- If the user doesn't specify an agent, choose the best one: Scout for research/leads, Quill for content/writing, Forge for tech, Radar for outreach/sales.
- For multi-step workflows, prefer using skills (execute_skill) over chaining tools manually.

## FORMATTING

- Use markdown for structure (headings, bullets, bold)
- Keep responses concise but complete
- Show data in tables when comparing items
- Include relevant metrics and numbers
- Use British English. Be direct, no fluff.

## AVAILABLE AGENTS
{agent_list}

## YOUR MEMORY
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
            "name": "collaborate",
            "description": "Coordinate multiple agents on a task. Each agent's response is visible. Use for tasks needing multiple specialists. Agents work sequentially (each sees prior agents' output) or in parallel.",
            "parameters": {
                "type": "object",
                "properties": {
                    "task": {"type": "string", "description": "The overall task description"},
                    "agents": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "properties": {
                                "agent_name": {"type": "string"},
                                "instruction": {"type": "string", "description": "Specific instruction for this agent"},
                            },
                            "required": ["agent_name", "instruction"],
                        },
                        "description": "Agents to involve, in execution order",
                    },
                    "mode": {"type": "string", "enum": ["sequential", "parallel"], "description": "Sequential (default): each agent sees prior output. Parallel: all agents work independently."},
                },
                "required": ["task", "agents"],
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
                    "agents_used": {"type": "array", "items": {"type": "string"}, "description": "List of agent names that contributed to this report"},
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
            "description": "Manage scheduled jobs: create, list, delete, toggle pause/resume, update existing, view past executions, or get upcoming calendar.",
            "parameters": {
                "type": "object",
                "properties": {
                    "action": {"type": "string", "enum": ["create", "list", "delete", "toggle", "executions", "calendar", "update"], "description": "What to do"},
                    "job_name": {"type": "string", "description": "Job name (for create/delete/toggle/executions/update)"},
                    "agent_name": {"type": "string", "description": "Agent to assign (create only)"},
                    "prompt": {"type": "string", "description": "What the agent should do each run (create only)"},
                    "frequency": {"type": "string", "enum": ["daily", "weekdays", "weekly", "monthly"], "description": "How often (create only)"},
                    "time": {"type": "string", "description": "HH:MM 24h format (create only, default 09:00)"},
                    "days": {"type": "integer", "description": "Calendar lookahead in days (calendar only, default 7)"},
                    "limit": {"type": "integer", "description": "Number of past executions to show (executions only, default 5)"},
                    "job_id": {"type": "string", "description": "Job ID to update (for update action)"},
                    "new_cron": {"type": "string", "description": "New cron expression (for update action, e.g. '0 10 * * 1')"},
                    "new_prompt": {"type": "string", "description": "New prompt/instructions for the job (for update action)"},
                    "new_name": {"type": "string", "description": "New name for the job (for update action)"},
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
            "name": "execute_strategy",
            "description": "Execute a strategy by coordinating its assigned agents on the strategy's approach. Triggers a multi-agent collaboration.",
            "parameters": {
                "type": "object",
                "properties": {
                    "strategy_id": {"type": "string", "description": "Strategy ID to execute"},
                    "task": {"type": "string", "description": "Specific task or prompt for this execution run"},
                },
                "required": ["strategy_id", "task"],
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
    {
        "type": "function",
        "function": {
            "name": "execute_skill",
            "description": "Run a pre-defined or custom skill (multi-step workflow). Skills chain multiple tools together automatically. Use 'manage_skills' with action='list' to see available skills first.",
            "parameters": {
                "type": "object",
                "properties": {
                    "skill_name": {"type": "string", "description": "Name of the skill to run (e.g. deploy_agent, morning_briefing, weekly_audit)"},
                    "params": {"type": "object", "description": "Parameters the skill needs (varies per skill)"},
                },
                "required": ["skill_name"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "manage_skills",
            "description": "Manage skills (multi-step workflows): list available, create custom, delete custom, or get details.",
            "parameters": {
                "type": "object",
                "properties": {
                    "action": {"type": "string", "enum": ["list", "create", "delete", "get"], "description": "What to do"},
                    "name": {"type": "string", "description": "Skill name (for get/create/delete)"},
                    "description": {"type": "string", "description": "Skill description (create only)"},
                    "params": {"type": "array", "items": {"type": "string"}, "description": "Parameter names the skill accepts (create only)"},
                    "steps": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "properties": {
                                "tool_name": {"type": "string"},
                                "args": {"type": "object"},
                            },
                        },
                        "description": "Skill steps — each has tool_name and args with {param.X} and {prev_result} templates (create only)",
                    },
                },
                "required": ["action"],
            },
        },
    },
    # --- HDL Integration ---
    {
        "type": "function",
        "function": {
            "name": "submit_health_check",
            "description": "Submit a health assessment to healthdatalab.net for a test persona. Loads the persona JSON, generates realistic form data, and POSTs to the HDL API.",
            "parameters": {
                "type": "object",
                "properties": {
                    "persona_name": {
                        "type": "string",
                        "enum": ["bob", "alice", "charlie", "diana", "echo"],
                        "description": "Test persona name",
                    },
                },
                "required": ["persona_name"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "submit_longevity_check",
            "description": "Submit a longevity assessment to healthdatalab.net. Triggers Make.com PDF report generation and email delivery.",
            "parameters": {
                "type": "object",
                "properties": {
                    "persona_name": {
                        "type": "string",
                        "enum": ["bob", "alice", "charlie", "diana", "echo"],
                        "description": "Test persona name",
                    },
                },
                "required": ["persona_name"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "check_hdl_status",
            "description": "Check HDL server connectivity and credit balance for a persona.",
            "parameters": {
                "type": "object",
                "properties": {
                    "persona_name": {
                        "type": "string",
                        "enum": ["bob", "alice", "charlie", "diana", "echo"],
                        "description": "Test persona name",
                    },
                },
                "required": ["persona_name"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "reset_hdl_credits",
            "description": "Top up health and longevity credits for the practitioner pool.",
            "parameters": {
                "type": "object",
                "properties": {
                    "amount": {
                        "type": "integer",
                        "description": "Number of credits to add (default 100, max 500)",
                    },
                },
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "run_hdl_diagnostics",
            "description": "Run SSH diagnostics on the HDL server (read-only).",
            "parameters": {
                "type": "object",
                "properties": {
                    "command": {
                        "type": "string",
                        "enum": ["ping", "tail-logs"],
                        "description": "Diagnostic command to run",
                    },
                },
                "required": ["command"],
            },
        },
    },
]


class MasterChat:
    """Orchestrates The Lab via LLM function calling."""

    def __init__(self, agent_manager, scheduler_manager, strategy_manager,
                 report_manager, knowledge_manager, agent_memory_manager,
                 correction_manager, cost_tracker, notion_bridge=None,
                 ws_manager=None, skill_manager=None):
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
        self.skill_manager = skill_manager

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

    # --- Chat History (multi-conversation) ---

    CHATS_DIR = os.path.join(DATA_DIR, "chats")

    def _ensure_chats_dir(self):
        os.makedirs(self.CHATS_DIR, exist_ok=True)

    def list_conversations(self) -> list:
        """List all conversations sorted by last update."""
        self._ensure_chats_dir()
        convos = []
        for fname in os.listdir(self.CHATS_DIR):
            if fname.endswith(".json"):
                try:
                    with open(os.path.join(self.CHATS_DIR, fname)) as f:
                        data = json.load(f)
                    convos.append({
                        "id": data.get("id", fname.replace(".json", "")),
                        "title": data.get("title", "New Chat"),
                        "created_at": data.get("created_at", ""),
                        "updated_at": data.get("updated_at", ""),
                        "message_count": len(data.get("messages", [])),
                    })
                except Exception:
                    pass
        convos.sort(key=lambda c: c.get("updated_at", ""), reverse=True)
        return convos

    def get_conversation(self, convo_id: str) -> dict:
        """Get a full conversation with messages."""
        self._ensure_chats_dir()
        path = os.path.join(self.CHATS_DIR, f"{convo_id}.json")
        if os.path.isfile(path):
            with open(path) as f:
                return json.load(f)
        return None

    def create_conversation(self, title: str = "New Chat") -> dict:
        """Create a new empty conversation."""
        self._ensure_chats_dir()
        convo_id = str(uuid.uuid4())
        convo = {
            "id": convo_id,
            "title": title,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "updated_at": datetime.now(timezone.utc).isoformat(),
            "messages": [],
        }
        with open(os.path.join(self.CHATS_DIR, f"{convo_id}.json"), "w") as f:
            json.dump(convo, f, indent=2)
        return convo

    def delete_conversation(self, convo_id: str) -> bool:
        path = os.path.join(self.CHATS_DIR, f"{convo_id}.json")
        if os.path.isfile(path):
            os.remove(path)
            return True
        return False

    def rename_conversation(self, convo_id: str, title: str) -> bool:
        convo = self.get_conversation(convo_id)
        if not convo:
            return False
        convo["title"] = title
        convo["updated_at"] = datetime.now(timezone.utc).isoformat()
        with open(os.path.join(self.CHATS_DIR, f"{convo_id}.json"), "w") as f:
            json.dump(convo, f, indent=2)
        return True

    def _save_message_to_convo(self, convo_id: str, role: str, content: str):
        """Save a message to a specific conversation."""
        convo = self.get_conversation(convo_id)
        if not convo:
            convo = self.create_conversation()
            convo_id = convo["id"]
        convo["messages"].append({
            "id": str(uuid.uuid4()),
            "role": role,
            "content": content,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        })
        # Auto-title from first user message
        if convo["title"] == "New Chat":
            first_user = next((m for m in convo["messages"] if m["role"] == "user"), None)
            if first_user:
                convo["title"] = first_user["content"][:60].strip()
        convo["updated_at"] = datetime.now(timezone.utc).isoformat()
        with open(os.path.join(self.CHATS_DIR, f"{convo_id}.json"), "w") as f:
            json.dump(convo, f, indent=2)
        return convo_id

    # Keep backward-compat methods for the floating chat widget
    def get_history(self) -> list:
        """Legacy: get flat history from the old single file."""
        if os.path.isfile(CHAT_FILE):
            with open(CHAT_FILE) as f:
                return json.load(f)
        return []

    def _save_message(self, role: str, content: str):
        """Legacy: save to flat history file (used by floating widget)."""
        history = self.get_history()
        history.append({
            "id": str(uuid.uuid4()),
            "role": role,
            "content": content,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        })
        if len(history) > 100:
            history = history[-100:]
        with open(CHAT_FILE, "w") as f:
            json.dump(history, f, indent=2)

    def clear_history(self):
        """Legacy: clear the flat history file."""
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

    def _get_skill_executor(self):
        """Lazy-create a SkillExecutor bound to this MasterChat instance."""
        if not hasattr(self, "_skill_executor") or self._skill_executor is None:
            from app.skills import SkillExecutor
            self._skill_executor = SkillExecutor(self)
        return self._skill_executor

    def _load_hdl_persona(self, persona_name: str) -> dict:
        """Load an HDL persona JSON file by name."""
        path = os.path.join(HDL_PERSONAS_DIR, f"{persona_name}.json")
        with open(path) as f:
            return json.load(f)

    # --- Learning Helpers ---

    async def _llm_func(self, prompt: str) -> str:
        """Lightweight LLM call for memory extraction."""
        try:
            config = self.get_config()
            client = OpenAI(api_key=settings.OPENAI_API_KEY, base_url=settings.OPENAI_BASE_URL, timeout=30.0)
            resp = client.chat.completions.create(
                model=config.get("model_name", "gpt-5.4"),
                messages=[{"role": "user", "content": prompt}],
                max_tokens=500,
            )
            return resp.choices[0].message.content or ""
        except Exception as e:
            logger.warning(f"LLM func for memory extraction failed: {e}")
            return ""

    async def _extract_learnings(self, user_msg: str, assistant_msg: str):
        """Background task: extract memories from a Master Chat exchange."""
        try:
            await self.agent_memory_manager.extract_from_chat(
                agent_id="master_chat",
                user_msg=user_msg,
                assistant_msg=assistant_msg,
                llm_func=self._llm_func,
            )
        except Exception as e:
            logger.warning(f"Master Chat learning extraction failed: {e}")

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
                    agents_used=args.get("agents_used"),
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
                    if self.ws_manager:
                        await self.ws_manager.broadcast("schedule_changed", {"action": "created", "name": args["job_name"]})
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
                    if self.ws_manager:
                        await self.ws_manager.broadcast("schedule_changed", {"action": "deleted", "name": job["name"]})
                    return f"Schedule '{job['name']}' deleted."

                elif action == "toggle":
                    job = self._resolve_job(args.get("job_name", ""))
                    if not job:
                        return f"Job '{args.get('job_name', '')}' not found."
                    self.scheduler_manager.toggle_job(job["id"])
                    new_state = "paused" if job.get("enabled") else "resumed"
                    if self.ws_manager:
                        await self.ws_manager.broadcast("schedule_changed", {"action": "toggled", "name": job["name"]})
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

                elif action == "update":
                    job_id = args.get("job_id")
                    if not job_id:
                        # Try to resolve by name
                        job_name = args.get("job_name", "")
                        if job_name:
                            for jid, jcfg in self.scheduler_manager.jobs.items():
                                if jcfg.get("name", "").lower() == job_name.lower():
                                    job_id = jid
                                    break
                    if not job_id:
                        return "Error: provide job_id or job_name for update action"
                    updates = {}
                    if args.get("new_cron"):
                        updates["cron_expression"] = args["new_cron"]
                    if args.get("new_prompt"):
                        updates["prompt"] = args["new_prompt"]
                    if args.get("new_name"):
                        updates["name"] = args["new_name"]
                    if not updates:
                        return "Error: provide at least one of new_cron, new_prompt, or new_name"
                    result = self.scheduler_manager.update_job(job_id, updates)
                    if self.ws_manager:
                        await self.ws_manager.broadcast("schedule_changed", {"action": "updated", "job_id": job_id})
                    return result

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
                    if self.ws_manager and result:
                        await self.ws_manager.broadcast("report_updated", {"action": "deleted", "report_id": args["report_id"]})
                    return "Report deleted." if result else "Report not found."

                elif action == "star":
                    if not args.get("report_id"):
                        return "report_id is required for star."
                    self.report_manager.update_report(args["report_id"], {"starred": True})
                    if self.ws_manager:
                        await self.ws_manager.broadcast("report_updated", {"action": "starred", "report_id": args["report_id"]})
                    return "Report starred."

                elif action == "unstar":
                    if not args.get("report_id"):
                        return "report_id is required for unstar."
                    self.report_manager.update_report(args["report_id"], {"starred": False})
                    if self.ws_manager:
                        await self.ws_manager.broadcast("report_updated", {"action": "unstarred", "report_id": args["report_id"]})
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
                    if self.ws_manager:
                        await self.ws_manager.broadcast("knowledge_changed", {"action": "added", "title": args["title"]})
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
                    if self.ws_manager and result:
                        await self.ws_manager.broadcast("knowledge_changed", {"action": "updated", "entry_id": args["entry_id"]})
                    return "Knowledge entry updated." if result else "Entry not found."

                elif action == "delete":
                    if not args.get("entry_id"):
                        return "entry_id is required for delete."
                    result = self.knowledge_manager.delete(args["entry_id"])
                    if self.ws_manager and result:
                        await self.ws_manager.broadcast("knowledge_changed", {"action": "deleted", "entry_id": args["entry_id"]})
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
                    if self.ws_manager:
                        await self.ws_manager.broadcast("strategy_changed", {"action": "created", "title": strategy["title"]})
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
                    if self.ws_manager and result:
                        await self.ws_manager.broadcast("strategy_changed", {"action": "updated", "strategy_id": args["strategy_id"]})
                    return "Strategy updated." if result else "Strategy not found."

                elif action == "delete":
                    if not args.get("strategy_id"):
                        return "strategy_id is required for delete."
                    result = self.strategy_manager.delete(args["strategy_id"])
                    if self.ws_manager and result:
                        await self.ws_manager.broadcast("strategy_changed", {"action": "deleted", "strategy_id": args["strategy_id"]})
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
                        if self.ws_manager:
                            await self.ws_manager.broadcast("task_created", {"title": task["title"]})
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
                    if self.ws_manager and result:
                        await self.ws_manager.broadcast("task_updated", {"page_id": args["page_id"], "status": args.get("status", "In Progress")})
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
                if self.ws_manager:
                    await self.ws_manager.broadcast("correction_added", {"agent_name": args["agent_name"]})
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

            # --- Skills ---

            elif tool_name == "execute_skill":
                if not self.skill_manager:
                    return "Skills system not available."
                executor = self._get_skill_executor()
                result = await executor.execute(
                    args["skill_name"],
                    args.get("params", {}),
                )
                if result.get("error"):
                    return result["error"]
                return result.get("summary", "Skill completed with no summary.")

            elif tool_name == "manage_skills":
                if not self.skill_manager:
                    return "Skills system not available."
                action = args["action"]

                if action == "list":
                    skills = self.skill_manager.list_all()
                    if not skills:
                        return "No skills available."
                    lines = []
                    for s in skills:
                        tag = " (built-in)" if s.get("builtin") else ""
                        params = ", ".join(s.get("params", [])) or "none"
                        lines.append(f"- **{s['name']}**{tag} — {s['description']} [params: {params}]")
                    return "\n".join(lines)

                elif action == "get":
                    skill = self.skill_manager.get(args.get("name", ""))
                    if not skill:
                        return f"Skill '{args.get('name', '')}' not found."
                    steps_desc = []
                    for i, step in enumerate(skill.get("steps", [])):
                        steps_desc.append(f"  {i+1}. {step['tool_name']}({json.dumps(step.get('args', {}))})")
                    return (
                        f"**{skill['name']}** — {skill['description']}\n"
                        f"Params: {', '.join(skill.get('params', [])) or 'none'}\n"
                        f"Steps:\n" + "\n".join(steps_desc)
                    )

                elif action == "create":
                    if not args.get("name") or not args.get("steps"):
                        return "name and steps are required to create a skill."
                    skill = self.skill_manager.create(
                        name=args["name"],
                        description=args.get("description", ""),
                        steps=args["steps"],
                        params=args.get("params", []),
                    )
                    if self.ws_manager:
                        await self.ws_manager.broadcast("skill_changed", {"action": "created", "name": args["name"]})
                    return f"Skill created: **{skill['name']}** with {len(skill['steps'])} steps."

                elif action == "delete":
                    if not args.get("name"):
                        return "name is required for delete."
                    result = self.skill_manager.delete(args["name"])
                    if result:
                        if self.ws_manager:
                            await self.ws_manager.broadcast("skill_changed", {"action": "deleted", "name": args["name"]})
                        return f"Skill '{args['name']}' deleted."
                    return f"Cannot delete '{args['name']}' — either built-in or not found."

                return f"Unknown manage_skills action: {action}"

            # --- Collaboration ---

            elif tool_name == "collaborate":
                task = args["task"]
                agent_specs = args.get("agents", [])
                mode = args.get("mode", "sequential")

                if not agent_specs:
                    return "No agents specified for collaboration."

                # Resolve all agents upfront
                resolved = []
                for spec in agent_specs:
                    agent = self._resolve_agent(spec["agent_name"])
                    if not agent:
                        return f"Agent '{spec['agent_name']}' not found."
                    resolved.append((agent, spec["instruction"]))

                collaboration_id = str(uuid.uuid4())[:8]
                agent_names = [a.name for a, _ in resolved]

                # Broadcast collaboration start
                if self.ws_manager:
                    await self.ws_manager.broadcast("agent_collaboration", {
                        "action": "started",
                        "collaboration_id": collaboration_id,
                        "task": task[:100],
                        "agent_names": agent_names,
                        "mode": mode,
                    })

                results = []
                prev_context = ""

                if mode == "parallel":
                    import asyncio

                    async def _run_agent(agent, instruction):
                        full_msg = f"[Collaboration Task: {task}]\n\n{instruction}"
                        self.agent_manager.update_status(agent.id, "working", f"Collaborating: {task[:40]}")
                        if self.ws_manager:
                            await self.ws_manager.broadcast("master_chat_progress", {
                                "stage": "agent_turn",
                                "agent_name": agent.name,
                                "description": f"{agent.name} is working on the task...",
                                "timestamp": datetime.now(timezone.utc).isoformat(),
                            })
                            await self.ws_manager.broadcast("agent_status", {
                                **agent.model_dump(mode="json"),
                                "status": "working",
                                "current_task": f"Collaborating: {task[:40]}",
                            })
                        response = await self.agent_manager.chat_async(agent.id, full_msg)
                        self.agent_manager.update_status(agent.id, "idle", None)
                        if self.ws_manager:
                            await self.ws_manager.broadcast("agent_status", {
                                **agent.model_dump(mode="json"),
                                "status": "idle", "current_task": None,
                            })
                        return (agent.name, response)

                    parallel_results = await asyncio.gather(
                        *[_run_agent(a, instr) for a, instr in resolved]
                    )
                    for name, response in parallel_results:
                        results.append({"agent": name, "response": response})
                        if self.ws_manager:
                            await self.ws_manager.broadcast("master_chat_progress", {
                                "stage": "agent_done",
                                "agent_name": name,
                                "description": f"{name} finished",
                                "timestamp": datetime.now(timezone.utc).isoformat(),
                            })
                            await self.ws_manager.broadcast("agent_collaboration", {
                                "action": "agent_responded",
                                "collaboration_id": collaboration_id,
                                "agent_name": name,
                                "response_preview": response[:200],
                            })

                else:  # sequential
                    for i, (agent, instruction) in enumerate(resolved):
                        # Build message with handoff context
                        parts = [f"[Collaboration Task: {task}]"]
                        if prev_context:
                            parts.append(f"\n[Previous agents' work so far:]\n{prev_context}")
                        parts.append(f"\n[Your instruction:] {instruction}")
                        full_msg = "\n".join(parts)

                        self.agent_manager.update_status(agent.id, "working", f"Collaborating: {task[:40]}")
                        if self.ws_manager:
                            await self.ws_manager.broadcast("master_chat_progress", {
                                "stage": "agent_turn",
                                "agent_name": agent.name,
                                "agent_index": i + 1,
                                "total_agents": len(resolved),
                                "description": f"{agent.name} is working ({i + 1}/{len(resolved)})...",
                                "timestamp": datetime.now(timezone.utc).isoformat(),
                            })
                            await self.ws_manager.broadcast("agent_status", {
                                **agent.model_dump(mode="json"),
                                "status": "working",
                                "current_task": f"Collaborating: {task[:40]}",
                            })

                        response = await self.agent_manager.chat_async(agent.id, full_msg)

                        self.agent_manager.update_status(agent.id, "idle", None)
                        if self.ws_manager:
                            await self.ws_manager.broadcast("master_chat_progress", {
                                "stage": "agent_done",
                                "agent_name": agent.name,
                                "description": f"{agent.name} finished",
                                "timestamp": datetime.now(timezone.utc).isoformat(),
                            })
                            await self.ws_manager.broadcast("agent_status", {
                                **agent.model_dump(mode="json"),
                                "status": "idle", "current_task": None,
                            })
                            await self.ws_manager.broadcast("agent_collaboration", {
                                "action": "agent_responded",
                                "collaboration_id": collaboration_id,
                                "agent_name": agent.name,
                                "response_preview": response[:200],
                            })

                        results.append({"agent": agent.name, "response": response})
                        # Build handoff context for next agent
                        prev_context += f"\n\n**{agent.name}:**\n{response[:1500]}"

                # Broadcast completion
                if self.ws_manager:
                    await self.ws_manager.broadcast("agent_collaboration", {
                        "action": "completed",
                        "collaboration_id": collaboration_id,
                        "agent_names": agent_names,
                        "result_count": len(results),
                    })

                # Format as group conversation
                output_parts = [f"**Collaboration: {task}** ({mode} mode, {len(results)} agents)\n"]
                for r in results:
                    output_parts.append(f"---\n**{r['agent']}:**\n{r['response']}\n")
                return "\n".join(output_parts)

            elif tool_name == "execute_strategy":
                strategy = self.strategy_manager.get(args["strategy_id"])
                if not strategy:
                    return f"Strategy '{args['strategy_id']}' not found."

                agent_ids = strategy.get("agent_ids", [])
                if not agent_ids:
                    return f"Strategy '{strategy['title']}' has no agents assigned."

                # Build agent specs from strategy
                agent_specs = []
                for aid in agent_ids:
                    agent = self._resolve_agent_by_id(aid)
                    if agent:
                        agent_specs.append({
                            "agent_name": agent.name,
                            "instruction": f"Execute your part of the strategy: {strategy.get('approach', strategy['title'])}. Focus on your speciality as {agent.role}.",
                        })

                # Smart mode: use sequential if approach implies dependencies
                approach = strategy.get("approach", "").lower()
                sequential_signals = ["then", "based on", "after", "followed by", "using the", "hand off"]
                mode = "sequential" if any(s in approach for s in sequential_signals) else "parallel"

                result = await self._execute_tool("collaborate", {
                    "task": f"Strategy: {strategy['title']} — {args['task']}",
                    "agents": agent_specs,
                    "mode": mode,
                })

                # Save execution result as a report
                try:
                    from app.models import ReportCreate
                    all_agent_names = [s["agent_name"] for s in agent_specs]
                    report_data = ReportCreate(
                        title=f"Strategy Execution: {strategy['title']}",
                        content=result,
                        report_type="strategy_execution",
                        agent_id=agent_ids[0],
                        agent_name=", ".join(all_agent_names),
                        source="strategy",
                    )
                    report = self.report_manager.create_report(report_data)
                    if self.ws_manager:
                        await self.ws_manager.broadcast("report_created", report.model_dump(mode="json"))

                        # Save individual per-agent reports for searchability
                        for spec in agent_specs:
                            agent = self._resolve_agent_by_name(spec["agent_name"]) if hasattr(self, '_resolve_agent_by_name') else self.agent_manager.get_agent_by_name(spec["agent_name"])
                            if agent:
                                import re
                                pattern = rf'\*\*{re.escape(spec["agent_name"])}:\*\*\n(.*?)(?=\n---|\n\*\*[A-Z]|\Z)'
                                match = re.search(pattern, result, re.DOTALL)
                                agent_section = match.group(1).strip() if match else ""
                                if agent_section and len(agent_section.strip()) > 20:
                                    individual = self.report_manager.create_report(ReportCreate(
                                        title=f"{spec['agent_name']}: {strategy['title']}",
                                        content=agent_section,
                                        report_type="strategy_execution",
                                        agent_id=agent.id,
                                        agent_name=spec["agent_name"],
                                        source="strategy",
                                    ))
                                    await self.ws_manager.broadcast("report_created", individual.model_dump(mode="json"))

                        await self.ws_manager.broadcast("strategy_changed", {"action": "executed", "strategy_id": args["strategy_id"]})
                    if self.notion_bridge and self.notion_bridge.configured:
                        try:
                            url = await self.notion_bridge.publish_report(
                                title=report.title, content=report.content,
                                agent_name=report.agent_name, report_type=report.report_type,
                                source=report.source,
                            )
                            if url:
                                self.report_manager.update_report(report.id, {"notion_page_url": url})
                        except Exception:
                            pass
                except Exception as e:
                    logger.warning(f"Failed to save strategy execution report: {e}")

                return result

            # --- HDL Integration ---

            elif tool_name == "submit_health_check":
                persona_name = args["persona_name"]
                persona = self._load_hdl_persona(persona_name)
                form_data = build_health_form_data(persona)
                result = submit_health_assessment(persona["email"], form_data, persona_name)
                if not isinstance(result, dict):
                    return f"Health assessment for {persona['name']}: unexpected API response: {result}"
                summary = f"Health assessment submitted for {persona['name']}: submission_id={result.get('submission_id', 'n/a')}, success={result.get('success', False)}"
                if self.ws_manager:
                    await self.ws_manager.broadcast("tool_executed", {
                        "tool_name": "submit_health_check",
                        "persona": persona_name,
                        "result": summary,
                        "timestamp": datetime.now(timezone.utc).isoformat(),
                    })
                return summary

            elif tool_name == "submit_longevity_check":
                persona_name = args["persona_name"]
                persona = self._load_hdl_persona(persona_name)
                complete_data = build_longevity_form_data(persona)
                result = submit_longevity_assessment(persona["email"], complete_data, persona_name)
                if not isinstance(result, dict):
                    return f"Longevity assessment for {persona['name']}: unexpected API response: {result}"
                summary = f"Longevity assessment submitted for {persona['name']}: submission_id={result.get('submission_id', 'n/a')}, make_status={result.get('make_status', 'n/a')}, success={result.get('success', False)}"
                if self.ws_manager:
                    await self.ws_manager.broadcast("tool_executed", {
                        "tool_name": "submit_longevity_check",
                        "persona": persona_name,
                        "result": summary,
                        "timestamp": datetime.now(timezone.utc).isoformat(),
                    })
                return summary

            elif tool_name == "check_hdl_status":
                persona_name = args["persona_name"]
                persona = self._load_hdl_persona(persona_name)
                result = check_user_status(persona["email"])
                if not isinstance(result, dict):
                    return f"HDL status for {persona['name']}: unexpected API response (got {type(result).__name__}: {result})"

                # Safe nested field extraction — WP API returns credits/daily_usage
                # as plain ints (e.g. 597) instead of {"health": X, "longevity": Y}
                raw_credits = result.get("credits", {})
                raw_usage = result.get("daily_usage", {})

                if isinstance(raw_credits, dict):
                    credit_health = raw_credits.get("health", "?")
                    credit_longevity = raw_credits.get("longevity", "?")
                else:
                    credit_health = raw_credits
                    credit_longevity = "n/a (total shown)"

                if isinstance(raw_usage, dict):
                    usage_health = raw_usage.get("health", 0)
                    usage_longevity = raw_usage.get("longevity", 0)
                else:
                    usage_health = raw_usage
                    usage_longevity = "n/a"

                roles = result.get("roles", [])
                if isinstance(roles, str):
                    roles = [roles]
                elif not isinstance(roles, list):
                    roles = [str(roles)]

                summary = (
                    f"HDL status for {persona['name']} ({persona['email']}):\n"
                    f"  User ID: {result.get('user_id', 'n/a')}\n"
                    f"  Roles: {', '.join(roles)}\n"
                    f"  Credits — health: {credit_health}, longevity: {credit_longevity}\n"
                    f"  Daily usage — health: {usage_health}, longevity: {usage_longevity}"
                )
                if self.ws_manager:
                    await self.ws_manager.broadcast("tool_executed", {
                        "tool_name": "check_hdl_status",
                        "persona": persona_name,
                        "result": summary[:200],
                        "timestamp": datetime.now(timezone.utc).isoformat(),
                    })
                return summary

            elif tool_name == "reset_hdl_credits":
                amount = args.get("amount", 100)
                practitioner_email = "260128vm+practitioner@gmail.com"
                result = reset_credits(practitioner_email, amount, "master_chat")
                if not isinstance(result, dict):
                    return f"Credit reset: unexpected API response: {result}"
                raw_credits = result.get("credits", result)
                credit_str = json.dumps(raw_credits) if isinstance(raw_credits, dict) else str(raw_credits)
                summary = f"Credits reset: added {amount} to practitioner pool. New balances: {credit_str}"
                if self.ws_manager:
                    await self.ws_manager.broadcast("tool_executed", {
                        "tool_name": "reset_hdl_credits",
                        "amount": amount,
                        "result": summary[:200],
                        "timestamp": datetime.now(timezone.utc).isoformat(),
                    })
                return summary

            elif tool_name == "run_hdl_diagnostics":
                command = args["command"]
                result = ssh_diagnostics(command)
                summary = f"HDL diagnostics ({command}): {result}"
                if self.ws_manager:
                    await self.ws_manager.broadcast("tool_executed", {
                        "tool_name": "run_hdl_diagnostics",
                        "command": command,
                        "result": summary[:200],
                        "timestamp": datetime.now(timezone.utc).isoformat(),
                    })
                return summary

            else:
                return f"Unknown tool: {tool_name}"

        except Exception as e:
            return f"Tool error ({tool_name}): {str(e)}"

    # --- Main Chat ---

    async def chat(self, user_message: str, image_base64: str = None, image_mime: str = None) -> dict:
        """Process a user message with function calling. Supports optional image for vision."""
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
        # Add cross-agent recent learnings for smarter orchestration
        try:
            cross_items = []
            for a in agents:
                recent = self.agent_memory_manager.get_recent(a.id, limit=2)
                for mem in recent:
                    cross_items.append(f"[{a.name}] {mem.content}")
            if cross_items:
                memory_context += "\n\n<recent_agent_learnings>\n" + "\n".join(cross_items[:10]) + "\n</recent_agent_learnings>"
        except Exception:
            pass
        # Inject Master Chat's own past learnings
        try:
            mc_memories = self.agent_memory_manager.get_recent("master_chat", limit=5)
            if mc_memories:
                mc_text = "\n".join(f"- {m.content}" for m in mc_memories)
                memory_context += f"\n\n<your_past_learnings>\n{mc_text}\n</your_past_learnings>"
        except Exception:
            pass
        system_prompt = SYSTEM_PROMPT.replace("{agent_list}", agent_list or "No agents configured yet.")
        system_prompt = system_prompt.replace("{memory_context}", memory_context or "No memory context available.")

        # Build conversation messages (last 20 for context)
        history = self.get_history()
        messages = [{"role": "system", "content": system_prompt}]
        for msg in history[-10:]:
            messages.append({"role": msg["role"], "content": msg["content"]})
        # Build user message (text-only or vision format)
        if image_base64 and image_mime:
            user_content = [
                {"type": "text", "text": user_message},
                {"type": "image_url", "image_url": {"url": f"data:{image_mime};base64,{image_base64}"}}
            ]
        else:
            user_content = user_message
        messages.append({"role": "user", "content": user_content})

        # Save user message (text only for history)
        self._save_message("user", user_message)

        # Call LLM with multi-iteration tool loop
        try:
            logger.info(f"Master Chat: provider={provider}, model={model}, tools={len(TOOLS)}, history={len(history)}")

            if provider == "openai":
                client = OpenAI(api_key=settings.OPENAI_API_KEY, base_url=settings.OPENAI_BASE_URL, timeout=90.0)
            elif provider == "anthropic":
                client = OpenAI(api_key=settings.OPENAI_API_KEY, base_url=settings.OPENAI_BASE_URL, timeout=90.0)
            else:
                client = OpenAI(api_key="ollama", base_url=settings.OLLAMA_BASE_URL + "/v1", timeout=90.0)

            # Detect action-oriented messages and force tool usage on first call
            msg_lower = user_message.lower()
            is_action = any(kw in msg_lower for kw in ACTION_KEYWORDS)
            tool_mode = "required" if is_action else "auto"
            logger.info(f"Master Chat: tool_choice={tool_mode} (action_detected={is_action})")

            all_tools_used = []
            total_input = 0
            total_output = 0
            max_iterations = 10
            iteration = 0
            final_text = ""

            while iteration < max_iterations:
                iteration += 1

                # Broadcast thinking between iterations
                if iteration > 1 and self.ws_manager:
                    await self.ws_manager.broadcast("master_chat_progress", {
                        "stage": "thinking",
                        "description": "Analysing results and planning next steps...",
                        "iteration": iteration,
                        "timestamp": datetime.now(timezone.utc).isoformat(),
                    })

                response = client.chat.completions.create(
                    model=model,
                    messages=messages,
                    tools=TOOLS,
                    tool_choice=tool_mode if iteration == 1 else "auto",
                )

                if response.usage:
                    total_input += response.usage.prompt_tokens or 0
                    total_output += response.usage.completion_tokens or 0

                assistant_msg = response.choices[0].message

                # If no tool calls, this is the final response — done
                if not assistant_msg.tool_calls:
                    final_text = assistant_msg.content or ""
                    logger.info(f"Master Chat: iteration {iteration} — final response (no tool calls). Preview: {final_text[:150]}")
                    break

                # GPT wants to call tools — execute them all
                logger.info(f"Master Chat: iteration {iteration} — GPT called {len(assistant_msg.tool_calls)} tools: {[tc.function.name for tc in assistant_msg.tool_calls]}")
                messages.append(assistant_msg.model_dump())

                for tool_call in assistant_msg.tool_calls:
                    fn_name = tool_call.function.name
                    fn_args = json.loads(tool_call.function.arguments)
                    logger.info(f"Master Chat: executing {fn_name}({json.dumps(fn_args)[:200]})")

                    if self.ws_manager:
                        await self.ws_manager.broadcast("master_chat_progress", {
                            "stage": "tool_start",
                            "tool": fn_name,
                            "description": _describe_tool_action(fn_name, fn_args),
                            "agent_name": fn_args.get("agent_name"),
                            "iteration": iteration,
                            "timestamp": datetime.now(timezone.utc).isoformat(),
                        })

                    result = await self._execute_tool(fn_name, fn_args)
                    logger.info(f"Master Chat: {fn_name} result: {result[:200]}")

                    if self.ws_manager:
                        await self.ws_manager.broadcast("master_chat_progress", {
                            "stage": "tool_complete",
                            "tool": fn_name,
                            "description": _describe_tool_action(fn_name, fn_args),
                            "agent_name": fn_args.get("agent_name"),
                            "iteration": iteration,
                            "timestamp": datetime.now(timezone.utc).isoformat(),
                        })

                    messages.append({
                        "tool_call_id": tool_call.id,
                        "role": "tool",
                        "content": result,
                    })
                    all_tools_used.append({"tool": fn_name, "summary": _tool_summary(fn_name, fn_args)})

                # Loop continues — GPT sees results and decides to call more tools or respond
            else:
                # Hit max iterations safety limit
                final_text = "I've reached my processing limit for this request. Here's what I've done so far based on the tools I've called."
                logger.warning(f"Master Chat: hit max_iterations ({max_iterations})")

            # Log aggregated cost
            if total_input or total_output:
                self.cost_tracker.log_call(
                    agent_id="master_chat", agent_name="Master Chat",
                    provider=provider, model=model,
                    input_tokens=total_input, output_tokens=total_output,
                    source="master_chat",
                    task_type="orchestration" if all_tools_used else "chat",
                )

            # Save assistant response
            self._save_message("assistant", final_text)

            # Extract learnings in background (non-blocking)
            if all_tools_used and self.agent_memory_manager:
                import asyncio as _aio
                _aio.create_task(self._extract_learnings(user_message, final_text))
            # Extract image analysis as memory
            if image_base64 and final_text and self.agent_memory_manager:
                import asyncio as _aio
                async def _save_image_memory():
                    try:
                        await self.agent_memory_manager.add(
                            agent_id="master_chat",
                            content=f"[Image Analysis] {final_text[:500]}",
                            memory_type="fact",
                            tags=["image", "visual_analysis"],
                        )
                    except Exception as e:
                        logger.warning(f"Image memory extraction failed: {e}")
                _aio.create_task(_save_image_memory())

            return {"response": final_text, "tools_used": all_tools_used, "iterations": iteration}

        except Exception as e:
            error_msg = f"Master Chat error: {str(e)}"
            self._save_message("assistant", error_msg)
            return {"response": error_msg, "tools_used": []}

    async def chat_in_conversation(self, convo_id: str, user_message: str, image_base64: str = None, image_mime: str = None) -> dict:
        """Process a message within a specific conversation. Supports optional image for vision."""
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
        # Add cross-agent recent learnings for smarter orchestration
        try:
            cross_items = []
            for a in agents:
                recent = self.agent_memory_manager.get_recent(a.id, limit=2)
                for mem in recent:
                    cross_items.append(f"[{a.name}] {mem.content}")
            if cross_items:
                memory_context += "\n\n<recent_agent_learnings>\n" + "\n".join(cross_items[:10]) + "\n</recent_agent_learnings>"
        except Exception:
            pass
        # Inject Master Chat's own past learnings
        try:
            mc_memories = self.agent_memory_manager.get_recent("master_chat", limit=5)
            if mc_memories:
                mc_text = "\n".join(f"- {m.content}" for m in mc_memories)
                memory_context += f"\n\n<your_past_learnings>\n{mc_text}\n</your_past_learnings>"
        except Exception:
            pass
        system_prompt = SYSTEM_PROMPT.replace("{agent_list}", agent_list or "No agents configured yet.")
        system_prompt = system_prompt.replace("{memory_context}", memory_context or "No memory context available.")

        # Get conversation history
        convo = self.get_conversation(convo_id)
        if not convo:
            convo = self.create_conversation()
            convo_id = convo["id"]

        messages = [{"role": "system", "content": system_prompt}]
        for msg in convo.get("messages", [])[-10:]:
            messages.append({"role": msg["role"], "content": msg["content"]})
        # Build user message (text-only or vision format)
        if image_base64 and image_mime:
            user_content = [
                {"type": "text", "text": user_message},
                {"type": "image_url", "image_url": {"url": f"data:{image_mime};base64,{image_base64}"}}
            ]
        else:
            user_content = user_message
        messages.append({"role": "user", "content": user_content})

        # Save user message (text only for history)
        convo_id = self._save_message_to_convo(convo_id, "user", user_message)

        # Call LLM with multi-iteration tool loop
        try:
            logger.info(f"Master Chat: provider={provider}, model={model}, tools={len(TOOLS)}, convo={convo_id[:8]}")

            if provider == "openai":
                client = OpenAI(api_key=settings.OPENAI_API_KEY, base_url=settings.OPENAI_BASE_URL, timeout=90.0)
            elif provider == "anthropic":
                client = OpenAI(api_key=settings.OPENAI_API_KEY, base_url=settings.OPENAI_BASE_URL, timeout=90.0)
            else:
                client = OpenAI(api_key="ollama", base_url=settings.OLLAMA_BASE_URL + "/v1", timeout=90.0)

            msg_lower = user_message.lower()
            is_action = any(kw in msg_lower for kw in ACTION_KEYWORDS)
            tool_mode = "required" if is_action else "auto"

            all_tools_used = []
            total_input = 0
            total_output = 0
            max_iterations = 10
            iteration = 0
            final_text = ""

            while iteration < max_iterations:
                iteration += 1

                if iteration > 1 and self.ws_manager:
                    await self.ws_manager.broadcast("master_chat_progress", {
                        "stage": "thinking",
                        "description": "Analysing results and planning next steps...",
                        "iteration": iteration,
                        "timestamp": datetime.now(timezone.utc).isoformat(),
                    })

                response = client.chat.completions.create(
                    model=model,
                    messages=messages,
                    tools=TOOLS,
                    tool_choice=tool_mode if iteration == 1 else "auto",
                )

                if response.usage:
                    total_input += response.usage.prompt_tokens or 0
                    total_output += response.usage.completion_tokens or 0

                assistant_msg = response.choices[0].message

                if not assistant_msg.tool_calls:
                    final_text = assistant_msg.content or ""
                    logger.info(f"Master Chat: convo iteration {iteration} — final response. Preview: {final_text[:150]}")
                    break

                logger.info(f"Master Chat: convo iteration {iteration} — GPT called {len(assistant_msg.tool_calls)} tools: {[tc.function.name for tc in assistant_msg.tool_calls]}")
                messages.append(assistant_msg.model_dump())

                for tool_call in assistant_msg.tool_calls:
                    fn_name = tool_call.function.name
                    fn_args = json.loads(tool_call.function.arguments)
                    logger.info(f"Master Chat: executing {fn_name}({json.dumps(fn_args)[:200]})")

                    if self.ws_manager:
                        await self.ws_manager.broadcast("master_chat_progress", {
                            "stage": "tool_start",
                            "tool": fn_name,
                            "description": _describe_tool_action(fn_name, fn_args),
                            "agent_name": fn_args.get("agent_name"),
                            "iteration": iteration,
                            "timestamp": datetime.now(timezone.utc).isoformat(),
                        })

                    result = await self._execute_tool(fn_name, fn_args)
                    logger.info(f"Master Chat: {fn_name} result: {result[:200]}")

                    if self.ws_manager:
                        await self.ws_manager.broadcast("master_chat_progress", {
                            "stage": "tool_complete",
                            "tool": fn_name,
                            "description": _describe_tool_action(fn_name, fn_args),
                            "agent_name": fn_args.get("agent_name"),
                            "iteration": iteration,
                            "timestamp": datetime.now(timezone.utc).isoformat(),
                        })

                    messages.append({
                        "tool_call_id": tool_call.id,
                        "role": "tool",
                        "content": result,
                    })
                    all_tools_used.append({"tool": fn_name, "summary": _tool_summary(fn_name, fn_args)})
            else:
                final_text = "I've reached my processing limit for this request. Here's what I've done so far based on the tools I've called."
                logger.warning(f"Master Chat: convo hit max_iterations ({max_iterations})")

            if total_input or total_output:
                self.cost_tracker.log_call(
                    agent_id="master_chat", agent_name="Master Chat",
                    provider=provider, model=model,
                    input_tokens=total_input, output_tokens=total_output,
                    source="master_chat",
                    task_type="orchestration" if all_tools_used else "chat",
                )

            self._save_message_to_convo(convo_id, "assistant", final_text)

            # Extract learnings in background (non-blocking)
            if all_tools_used and self.agent_memory_manager:
                import asyncio as _aio
                _aio.create_task(self._extract_learnings(user_message, final_text))
            # Extract image analysis as memory
            if image_base64 and final_text and self.agent_memory_manager:
                import asyncio as _aio
                async def _save_image_memory():
                    try:
                        await self.agent_memory_manager.add(
                            agent_id="master_chat",
                            content=f"[Image Analysis] {final_text[:500]}",
                            memory_type="fact",
                            tags=["image", "visual_analysis"],
                        )
                    except Exception as e:
                        logger.warning(f"Image memory extraction failed: {e}")
                _aio.create_task(_save_image_memory())

            return {"convo_id": convo_id, "response": final_text, "tools_used": all_tools_used, "iterations": iteration}

        except Exception as e:
            error_msg = f"Master Chat error: {str(e)}"
            self._save_message_to_convo(convo_id, "assistant", error_msg)
            return {"convo_id": convo_id, "response": error_msg, "tools_used": []}

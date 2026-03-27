"""Master Chat — AI command centre for The Lab with function calling."""

import json
import os
import uuid
from datetime import datetime
from typing import Optional

from openai import OpenAI

from app.config import settings

DATA_DIR = settings.DATA_DIR
CHAT_FILE = os.path.join(DATA_DIR, "master_chat_history.json")
CONFIG_FILE = os.path.join(DATA_DIR, "master_chat_config.json")

SYSTEM_PROMPT = """You are The Lab's Master Chat — the AI command centre that orchestrates everything.

## Your Role
You help the user manage their AI agent operations hub. You can create strategies, schedule jobs, run agents, search knowledge, and check reports — all from this chat.

## Available Agents
- **Scout** — Senior Market Research Analyst. Finds leads, competitor intel, market opportunities.
- **Quill** — Content Strategist & Writer. Blog posts, emails, social media, SEO content.
- **Forge** — Full-Stack Developer. Technical health checks, bug fixes, prototypes.
- **Radar** — Business Development Rep. Outreach, lead qualification, partnership opportunities.

## How to Work
- When the user asks to do something, use the available tools to execute it immediately. Don't ask for confirmation — just do it and report what you did.
- If the user wants a specialist agent that doesn't exist, create one with create_agent, then use it.
- If the user doesn't specify an agent, choose the best one: Scout for research/leads, Quill for content/writing, Forge for tech, Radar for outreach/sales.
- Chain multiple tools when needed (e.g., create_agent → create_schedule → run job — all in one turn).
- You can call multiple tools in one turn to handle complex requests.
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
            "description": "Search the Lab's knowledge base for relevant information before taking action. Use this to check what's already known.",
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
            "description": "Send a task to a specific agent (Scout, Quill, Forge, or Radar) and get their response. Use this when the user wants an agent to do work.",
            "parameters": {
                "type": "object",
                "properties": {
                    "agent_name": {"type": "string", "description": "Agent name: Scout, Quill, Forge, or Radar"},
                    "message": {"type": "string", "description": "The task or question for the agent"},
                },
                "required": ["agent_name", "message"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "create_strategy",
            "description": "Create a new business strategy that maps a problem to agents. Use when the user defines a goal or business problem to solve.",
            "parameters": {
                "type": "object",
                "properties": {
                    "title": {"type": "string", "description": "Short strategy title"},
                    "problem": {"type": "string", "description": "The business problem being solved"},
                    "approach": {"type": "string", "description": "How agents will tackle this"},
                    "agent_names": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "Agent names to assign (e.g. ['Scout', 'Radar'])",
                    },
                },
                "required": ["title"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "create_schedule",
            "description": "Create a scheduled job (cron) for an agent. Use when the user wants recurring automated work.",
            "parameters": {
                "type": "object",
                "properties": {
                    "name": {"type": "string", "description": "Job name"},
                    "agent_name": {"type": "string", "description": "Agent name: Scout, Quill, Forge, or Radar"},
                    "prompt": {"type": "string", "description": "What the agent should do each run"},
                    "frequency": {"type": "string", "enum": ["daily", "weekdays", "weekly", "monthly"], "description": "How often"},
                    "time": {"type": "string", "description": "Time in HH:MM format (24h)", "default": "09:00"},
                },
                "required": ["name", "agent_name", "prompt", "frequency"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "run_job_now",
            "description": "Run a scheduled job immediately. Use when the user wants instant results from an existing schedule.",
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
            "name": "list_reports",
            "description": "Get recent reports from agents. Use to show what agents have produced.",
            "parameters": {
                "type": "object",
                "properties": {
                    "agent_name": {"type": "string", "description": "Filter by agent name (optional)"},
                    "limit": {"type": "integer", "description": "Max reports to return", "default": 5},
                },
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "add_knowledge",
            "description": "Add new information to the Lab's knowledge base. Use when the user shares facts, rules, or preferences that should be remembered.",
            "parameters": {
                "type": "object",
                "properties": {
                    "title": {"type": "string", "description": "Entry title"},
                    "content": {"type": "string", "description": "The knowledge content"},
                    "category": {"type": "string", "enum": ["rule", "fact", "reference", "preference"], "description": "Category"},
                },
                "required": ["title", "content", "category"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "create_agent",
            "description": "Create a new AI agent with a custom role, goal, and backstory. Use when the user wants a specialist agent that doesn't exist yet (beyond Scout, Quill, Forge, Radar).",
            "parameters": {
                "type": "object",
                "properties": {
                    "name": {"type": "string", "description": "Agent name (e.g. 'Pulse', 'Apex')"},
                    "role": {"type": "string", "description": "Job title (e.g. 'Social Media Manager')"},
                    "goal": {"type": "string", "description": "What this agent aims to achieve"},
                    "backstory": {"type": "string", "description": "Agent's background and expertise context"},
                },
                "required": ["name", "role", "goal", "backstory"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_lab_status",
            "description": "Get overall Lab status — agents, reports, schedules, strategies, memory stats. Use for status checks or morning briefings.",
            "parameters": {"type": "object", "properties": {}},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "publish_to_notion",
            "description": "Publish a report to Notion. Use after an agent produces a report that should be shared or reviewed in Notion.",
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
            "name": "list_schedules",
            "description": "List all scheduled jobs (cron jobs). Shows what's running, when, and for which agent.",
            "parameters": {"type": "object", "properties": {}},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "list_strategies",
            "description": "List all business strategies with their status, assigned agents, and linked schedules.",
            "parameters": {"type": "object", "properties": {}},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "read_report",
            "description": "Read the full content of a specific report. Use when the user wants to see what an agent produced.",
            "parameters": {
                "type": "object",
                "properties": {
                    "agent_name": {"type": "string", "description": "Agent name to get latest report from"},
                },
                "required": ["agent_name"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "toggle_schedule",
            "description": "Pause or resume a scheduled job. Use when the user wants to stop or restart a recurring job.",
            "parameters": {
                "type": "object",
                "properties": {
                    "job_name": {"type": "string", "description": "Name of the job to pause/resume"},
                },
                "required": ["job_name"],
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
        if os.path.isfile(CONFIG_FILE):
            with open(CONFIG_FILE) as f:
                return json.load(f)
        return {"provider": "openai", "model_name": "gpt-5.4"}

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
            if tool_name == "search_knowledge":
                results = self.knowledge_manager.search(args["query"], top_k=5)
                if not results:
                    return "No knowledge entries found for that query."
                return json.dumps([{"title": r.get("title", ""), "content": r.get("content", "")[:200]} for r in results], indent=2)

            elif tool_name == "create_agent":
                from app.models import AgentCreate
                agent_data = AgentCreate(
                    name=args["name"],
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

            elif tool_name == "chat_with_agent":
                agent = self._resolve_agent(args["agent_name"])
                if not agent:
                    return f"Agent '{args['agent_name']}' not found. Available: Scout, Quill, Forge, Radar."

                # Broadcast working status → triggers Office agents + Bridge + UI
                task_preview = args["message"][:50]
                self.agent_manager.update_status(agent.id, "working", f"Master Chat: {task_preview}")
                if self.ws_manager:
                    await self.ws_manager.broadcast("agent_status", {
                        **agent.model_dump(mode="json"),
                        "status": "working",
                        "current_task": f"Master Chat: {task_preview}",
                    })

                response = await self.agent_manager.chat_async(agent.id, args["message"])

                # Broadcast idle status
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

            elif tool_name == "create_strategy":
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

            elif tool_name == "create_schedule":
                agent = self._resolve_agent(args["agent_name"])
                if not agent:
                    return f"Agent '{args['agent_name']}' not found."
                job = self.scheduler_manager.create_job_simple({
                    "name": args["name"],
                    "description": args.get("name", ""),
                    "frequency": args.get("frequency", "daily"),
                    "time": args.get("time", "09:00"),
                    "prompt": args["prompt"],
                    "agent_id": agent.id,
                })
                return f"Schedule created: '{args['name']}' — {args.get('frequency', 'daily')} at {args.get('time', '09:00')} with {agent.name}."

            elif tool_name == "run_job_now":
                job = self._resolve_job(args["job_name"])
                if not job:
                    return f"Job '{args['job_name']}' not found. Check Calendar for available jobs."
                result = await self.scheduler_manager.run_job_now(job["id"])
                preview = str(result)[:500] if result else "Job completed (no output)."
                return f"Job '{job['name']}' executed. Result:\n{preview}"

            elif tool_name == "list_reports":
                agent_name = args.get("agent_name")
                limit = args.get("limit", 5)
                reports = self.report_manager.list_reports(agent_name=agent_name, limit=limit)
                if not reports:
                    return "No reports found."
                items = []
                for r in reports[:limit]:
                    items.append(f"- **{r.title}** ({r.agent_name}, {r.report_type}) — {str(r.created_at)[:10]}")
                return "\n".join(items)

            elif tool_name == "add_knowledge":
                entry = self.knowledge_manager.add({
                    "title": args["title"],
                    "content": args["content"],
                    "category": args.get("category", "fact"),
                    "tags": [],
                })
                return f"Knowledge added: '{args['title']}' ({args.get('category', 'fact')})"

            elif tool_name == "get_lab_status":
                agents = self.agent_manager.list_agents()
                reports = self.report_manager.list_reports(limit=1000)
                jobs = self.scheduler_manager.list_jobs()
                strategies = self.strategy_manager.list_all()
                active_strats = [s for s in strategies if s.get("status") == "active"]

                status_lines = [
                    f"**Agents:** {len(agents)} ({', '.join(a.name for a in agents)})",
                    f"**Reports:** {len(reports)} total",
                    f"**Scheduled Jobs:** {len(jobs)} ({sum(1 for j in jobs if j.get('enabled'))} enabled)",
                    f"**Strategies:** {len(strategies)} ({len(active_strats)} active)",
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

            elif tool_name == "list_schedules":
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

            elif tool_name == "list_strategies":
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
                    lines.append(f"- **{s['title']}** [{status}] — {', '.join(agent_names) or 'No agents'}")
                    if s.get("problem"):
                        lines.append(f"  Problem: {s['problem'][:100]}")
                return "\n".join(lines)

            elif tool_name == "read_report":
                agent_name = args.get("agent_name")
                reports = self.report_manager.list_reports(agent_name=agent_name, limit=1)
                if not reports:
                    return f"No reports found for {agent_name}."
                r = reports[0]
                content = r.content[:2000] if len(r.content) > 2000 else r.content
                return f"**{r.title}** ({r.agent_name}, {r.report_type})\n{str(r.created_at)[:10]}\n\n{content}"

            elif tool_name == "toggle_schedule":
                job = self._resolve_job(args["job_name"])
                if not job:
                    return f"Job '{args['job_name']}' not found."
                self.scheduler_manager.toggle_job(job["id"])
                new_state = "paused" if job.get("enabled") else "resumed"
                return f"Job '{job['name']}' {new_state}."

            else:
                return f"Unknown tool: {tool_name}"

        except Exception as e:
            return f"Tool error ({tool_name}): {str(e)}"

    # --- Main Chat ---

    async def chat(self, user_message: str) -> str:
        """Process a user message with function calling."""
        config = self.get_config()
        provider = config.get("provider", "openai")
        model = config.get("model_name", "gpt-4o")

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

        system_prompt = SYSTEM_PROMPT.replace("{memory_context}", memory_context or "No memory context available.")

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
                # Execute each tool
                tool_results = []
                for tool_call in assistant_msg.tool_calls:
                    fn_name = tool_call.function.name
                    fn_args = json.loads(tool_call.function.arguments)
                    result = await self._execute_tool(fn_name, fn_args)
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

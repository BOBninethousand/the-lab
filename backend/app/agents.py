import json
import os
import uuid
import asyncio
import logging
from datetime import datetime, timezone
from typing import Optional, List, Dict, Any
from app.config import settings
from app.models import Agent, AgentCreate, Task, TaskCreate, ChatMessage
from langchain_openai import ChatOpenAI
from langchain_anthropic import ChatAnthropic
from langchain_community.chat_models import ChatOllama

logger = logging.getLogger(__name__)


AVATAR_COLORS = {
    "openai": "#3b6fcc",
    "anthropic": "#c4682d",
    "ollama": "#7c5bbf",
    "openclaw": "#10b981",
}

DEFAULT_AGENTS = [
    {
        "name": "Scout",
        "role": "Senior Market Research Analyst",
        "goal": "Research competitors, market trends, potential customers, and growth opportunities for HealthDataLab, Altituding, and IrisMapper.",
        "backstory": (
            "Scout is a seasoned market research analyst specialising in the longevity, holistic health, "
            "and complementary medicine markets. Works for Matthew D'haemer, a naturopath and founder of "
            "HealthDataLab (longevity assessment platform for practitioners), Altituding (B2C coaching), "
            "and IrisLab (iridology equipment). Knows the IIPA practitioner community (~100-150 members), "
            "the 2,000 IrisLab contact list (primary distribution channel), and the competitor landscape "
            "(Health Experts Alliance, longevity clinics, corporate wellness). Understands practitioner "
            "psychology: they think in professional development investments, respond to authentic positioning, "
            "and are sceptical of hype. Uses British English. Longevity market is $29.8B (2025) growing to "
            "$46.9B by 2031. CAM market growing at 23-26% CAGR."
        ),
        "provider": "openai",
        "model_name": "gpt-5.4",
        "avatar_color": "#3b6fcc",
    },
    {
        "name": "Quill",
        "role": "Content Strategist & Writer",
        "goal": "Create compelling blog posts, social media content, email sequences, and SEO content that drives traffic and conversions.",
        "backstory": (
            "Quill is a content strategist who writes for holistic health practitioners and health-conscious "
            "professionals. Understands the Longevity Trajectory Protocol (Map > Read > Guide > Track), the "
            "3+9 course structure (3-week intensive + 9-week implementation), and HDL's positioning as an "
            "'add-on layer to existing practice' — not a replacement. Writes in British English. Applies Alex "
            "Hormozi's Value Equation and 'give away the secrets, sell the implementation' content philosophy. "
            "No vague wellness language. No medical claims — frames everything around healthspan, function, and "
            "capability. Direct, sharp, no fluff. Never uses the word 'genuinely'. Key messaging: 'You already "
            "see the whole person. Now you can prove it.' and 'From Healing to Thriving.'"
        ),
        "provider": "openai",
        "model_name": "gpt-5.4",
        "avatar_color": "#c4682d",
    },
    {
        "name": "Forge",
        "role": "Senior Full-Stack Developer",
        "goal": "Build features, fix bugs, create prototypes, and ship code for our websites.",
        "backstory": (
            "Forge is a senior full-stack developer working on HealthDataLab (healthdatalab.com for marketing "
            "via WordPress, healthdatalab.net for platform), Altituding (altituding.com), IrisLab (irislab.com), "
            "and IrisMapper (irismapper.com). Tech stack: WordPress for sales sites, Python/FastAPI backend, "
            "React frontend, Ollama for local AI, Brevo for email automation, Stripe for payments, Calendly for "
            "scheduling. Builds reliable, simple solutions. Knows the credit system, practitioner accounts, "
            "longevity report generation pipeline (22-factor questionnaire > biological age calculation > PDF "
            "report with trajectory chart). Ships fast, momentum over perfection."
        ),
        "provider": "openai",
        "model_name": "gpt-5.4",
        "avatar_color": "#7c5bbf",
    },
    {
        "name": "Radar",
        "role": "Business Development Representative",
        "goal": "Find potential leads, draft outreach messages, identify partnership opportunities, and track sales pipeline.",
        "backstory": (
            "Radar is a business development specialist focused on practitioner outreach for HealthDataLab. "
            "Knows the 4 pricing tiers: Launchpad (free then 19/mo), Minimum (99/mo), Course (597 Super Early, "
            "recommended), Signature (1,497 Super Early). Applies the CLOSER sales framework (Clarify, Label, "
            "Overview, Sell, Explain, Reinforce) and Hormozi's lead generation principles. Understands the "
            "reciprocity gate: 2-3 touches max for non-responders, then move on. Drafts outreach in warm, "
            "collegial tone — practitioners respond to authentic positioning about preparation and competence, "
            "not aggressive revenue promises. IIPA is the highest-value relationship. The IrisLab 2,000 list "
            "is the primary distribution channel. Always offer low-barrier engagement first (watch video, read "
            "article) before suggesting calls. Uses British English."
        ),
        "provider": "openai",
        "model_name": "gpt-5.4",
        "avatar_color": "#1d8fa0",
    },
    {
        "name": "Dr Bob",
        "role": "HDL Practitioner Manager",
        "goal": (
            "Manage the HDL test patient pool. Monitor credit balances, verify all 5 client agents "
            "submitted their weekly assessments, flag anomalies, and produce a weekly summary report for Notion."
        ),
        "backstory": (
            "Dr Bob is the practitioner account manager for the HealthDataLab synthetic test pool. "
            "He oversees five test clients (Bob, Alice, Charlie, Diana, Echo) who submit weekly health "
            "and longevity assessments through healthdatalab.net. His job is to ensure every agent "
            "submits on schedule, credits remain sufficient, and no anomalies appear in the data. "
            "Each Friday he produces a status report covering submission compliance, credit balances, "
            "trajectory trends across the pool, and any flags (missed submissions, low credits, "
            "unexpected score swings). Reports go to Notion. Uses British English."
        ),
        "provider": "openai",
        "model_name": "gpt-5.4",
        "avatar_color": "#2196F3",
    },
    {
        "name": "Agent Bob",
        "role": "HDL Test Client \u2014 Improving",
        "goal": (
            "Submit weekly health and longevity assessments to healthdatalab.net as a synthetic test patient. "
            "Generate realistic form data from my persona profile, POST to the HDL API, and log results to Notion."
        ),
        "backstory": (
            "Agent Bob is a 35-year-old male synthetic test patient (178 cm, 82 kg) with moderate "
            "fitness. He weight-trains and walks 3\u20134 times per week, averaging 7,500 daily steps. "
            "His main health challenges are lower back pain and occasional insomnia. He has a family "
            "history of type 2 diabetes (father at 60). His trajectory is improving \u2014 gradually "
            "building better sleep quality, increasing physical activity, and working on balance. "
            "Email: 260128vm+bob@gmail.com. Uses British English."
        ),
        "provider": "openai",
        "model_name": "gpt-5.4",
        "avatar_color": "#4CAF50",
    },
    {
        "name": "Agent Alice",
        "role": "HDL Test Client \u2014 Stable",
        "goal": (
            "Submit weekly health and longevity assessments to healthdatalab.net as a synthetic test patient. "
            "Generate realistic form data from my persona profile, POST to the HDL API, and log results to Notion."
        ),
        "backstory": (
            "Agent Alice is a 42-year-old female synthetic test patient (165 cm, 62 kg) in good "
            "overall health. She practises yoga, swimming, and hiking 4\u20135 times per week with "
            "9,000 daily steps. Her main challenges are chronic work stress and tension headaches "
            "requiring occasional ibuprofen. Family history includes breast cancer (mother at 55). "
            "Her trajectory is stable \u2014 maintaining strong baselines while focusing on stress "
            "levels and sleep quality. Email: 260128vm+alice@gmail.com. Uses British English."
        ),
        "provider": "openai",
        "model_name": "gpt-5.4",
        "avatar_color": "#9C27B0",
    },
    {
        "name": "Agent Charlie",
        "role": "HDL Test Client \u2014 Improving",
        "goal": (
            "Submit weekly health and longevity assessments to healthdatalab.net as a synthetic test patient. "
            "Generate realistic form data from my persona profile, POST to the HDL API, and log results to Notion."
        ),
        "backstory": (
            "Agent Charlie is a 28-year-old male synthetic test patient (182 cm, 78 kg) who is "
            "very active \u2014 CrossFit, running, and cycling 5\u20136 times per week with 12,000 daily "
            "steps. He experiments with keto and paleo diets and takes creatine and protein powder. "
            "Occasional joint pain from training. No significant family history. His trajectory is "
            "improving at a moderate rate, focusing on diet quality and cognitive activity. "
            "Email: 260128vm+charlie@gmail.com. Uses British English."
        ),
        "provider": "openai",
        "model_name": "gpt-5.4",
        "avatar_color": "#FF9800",
    },
    {
        "name": "Agent Diana",
        "role": "HDL Test Client \u2014 Declining",
        "goal": (
            "Submit weekly health and longevity assessments to healthdatalab.net as a synthetic test patient. "
            "Generate realistic form data from my persona profile, POST to the HDL API, and log results to Notion."
        ),
        "backstory": (
            "Agent Diana is a 55-year-old female synthetic test patient (160 cm, 70 kg) with elevated "
            "blood pressure (138/86), perimenopause symptoms, and declining sleep quality. She is a "
            "former smoker (quit 10 years ago) on a low-dose ACE inhibitor and magnesium supplement. "
            "Family history includes hypertension (mother) and osteoporosis (grandmother). Her trajectory "
            "is declining \u2014 sleep quality and duration are gradually worsening. She walks and does "
            "light resistance 2\u20133 times per week. Email: 260128vm+diana@gmail.com. Uses British English."
        ),
        "provider": "openai",
        "model_name": "gpt-5.4",
        "avatar_color": "#F44336",
    },
    {
        "name": "Agent Echo",
        "role": "HDL Test Client \u2014 Rapid Improvement",
        "goal": (
            "Submit weekly health and longevity assessments to healthdatalab.net as a synthetic test patient. "
            "Generate realistic form data from my persona profile, POST to the HDL API, and log results to Notion."
        ),
        "backstory": (
            "Agent Echo is a 38-year-old male synthetic test patient (175 cm, 95 kg) recovering from "
            "a sedentary lifestyle. He is overweight with pre-diabetic markers, low energy, and family "
            "history of type 2 diabetes (father at 50) and high cholesterol (mother). He has started "
            "walking and bodyweight exercises 1\u20132 times per week. His trajectory is rapidly improving "
            "\u2014 making aggressive changes to physical activity, diet quality, hydration, and sunlight "
            "exposure. Goal: lose 15 kg, build exercise habit, reverse pre-diabetes. "
            "Email: 260128vm+echo@gmail.com. Uses British English."
        ),
        "provider": "openai",
        "model_name": "gpt-5.4",
        "avatar_color": "#00BCD4",
    },
]


class AgentManager:
    def __init__(self):
        self.agents: Dict[str, Agent] = {}
        self.tasks: Dict[str, Task] = {}
        self.chat_histories: Dict[str, List[ChatMessage]] = {}
        self.agents_file = f"{settings.DATA_DIR}/agents.json"
        self.tasks_file = f"{settings.DATA_DIR}/tasks.json"
        self.cost_tracker = None  # Set externally after init
        self._load_agents()
        self._load_tasks()

    def _load_agents(self):
        if os.path.exists(self.agents_file):
            try:
                with open(self.agents_file, "r") as f:
                    data = json.load(f)
                    for agent_id, agent_data in data.items():
                        agent_data["created_at"] = datetime.fromisoformat(
                            agent_data["created_at"]
                        ).replace(tzinfo=timezone.utc)
                        self.agents[agent_id] = Agent(**agent_data)
                # Sync backstories and create any missing default agents
                self._ensure_default_agents()
            except Exception as e:
                print(f"Error loading agents: {e}")
                self._create_default_agents()
        else:
            self._create_default_agents()

    def _ensure_default_agents(self):
        """Sync existing defaults and create any missing default agents."""
        defaults_by_name = {d["name"]: d for d in DEFAULT_AGENTS}
        existing_names = {agent.name for agent in self.agents.values()}
        updated = False

        # Update existing agents with latest backstory/goal/role
        for agent in self.agents.values():
            if agent.name in defaults_by_name:
                d = defaults_by_name[agent.name]
                if agent.backstory != d["backstory"] or agent.goal != d["goal"] or agent.role != d["role"]:
                    agent.backstory = d["backstory"]
                    agent.goal = d["goal"]
                    agent.role = d["role"]
                    updated = True

        # Create agents missing from agents.json
        for d in DEFAULT_AGENTS:
            if d["name"] not in existing_names:
                agent = Agent(
                    id=str(uuid.uuid4()),
                    name=d["name"],
                    role=d["role"],
                    goal=d["goal"],
                    backstory=d["backstory"],
                    provider=d["provider"],
                    model_name=d["model_name"],
                    status="idle",
                    current_task=None,
                    avatar_color=d["avatar_color"],
                    created_at=datetime.now(timezone.utc),
                )
                self.agents[agent.id] = agent
                updated = True
                logger.info(f"Created missing default agent: {d['name']}")

        if updated:
            self._save_agents()
            logger.info("Default agents synced")

    def _create_default_agents(self):
        for agent_data in DEFAULT_AGENTS:
            agent = Agent(
                id=str(uuid.uuid4()),
                name=agent_data["name"],
                role=agent_data["role"],
                goal=agent_data["goal"],
                backstory=agent_data["backstory"],
                provider=agent_data["provider"],
                model_name=agent_data["model_name"],
                status="idle",
                current_task=None,
                avatar_color=agent_data["avatar_color"],
                created_at=datetime.now(timezone.utc),
            )
            self.agents[agent.id] = agent
        self._save_agents()

    def _load_tasks(self):
        if os.path.exists(self.tasks_file):
            try:
                with open(self.tasks_file, "r") as f:
                    data = json.load(f)
                    for task_id, task_data in data.items():
                        task_data["created_at"] = datetime.fromisoformat(
                            task_data["created_at"]
                        ).replace(tzinfo=timezone.utc)
                        if task_data.get("completed_at"):
                            task_data["completed_at"] = datetime.fromisoformat(
                                task_data["completed_at"]
                            ).replace(tzinfo=timezone.utc)
                        self.tasks[task_id] = Task(**task_data)
            except Exception as e:
                print(f"Error loading tasks: {e}")
                self.tasks = {}
        else:
            self.tasks = {}

    def _save_agents(self):
        os.makedirs(settings.DATA_DIR, exist_ok=True)
        with open(self.agents_file, "w") as f:
            data = {
                agent_id: {
                    **agent.model_dump(mode="json"),
                    "created_at": agent.created_at.isoformat(),
                }
                for agent_id, agent in self.agents.items()
            }
            json.dump(data, f, indent=2)

    def _save_tasks(self):
        os.makedirs(settings.DATA_DIR, exist_ok=True)
        with open(self.tasks_file, "w") as f:
            data = {}
            for task_id, task in self.tasks.items():
                task_dict = task.model_dump(mode="json")
                task_dict["created_at"] = task.created_at.isoformat()
                if task.completed_at:
                    task_dict["completed_at"] = task.completed_at.isoformat()
                data[task_id] = task_dict
            json.dump(data, f, indent=2)

    def create_agent(self, data: AgentCreate) -> Agent:
        agent = Agent(
            id=str(uuid.uuid4()),
            name=data.name,
            role=data.role,
            goal=data.goal,
            backstory=data.backstory,
            provider=data.provider,
            model_name=data.model_name,
            status="idle",
            current_task=None,
            avatar_color=AVATAR_COLORS.get(data.provider, "#3b6fcc"),
            created_at=datetime.now(timezone.utc),
        )
        self.agents[agent.id] = agent
        self._save_agents()
        return agent

    def list_agents(self) -> List[Agent]:
        return list(self.agents.values())

    def get_agent(self, agent_id: str) -> Optional[Agent]:
        return self.agents.get(agent_id)

    def get_agent_by_name(self, name: str) -> Optional[Agent]:
        for agent in self.agents.values():
            if agent.name.lower() == name.lower():
                return agent
        return None

    def delete_agent(self, agent_id: str):
        if agent_id in self.agents:
            del self.agents[agent_id]
            self._save_agents()

    def update_status(
        self, agent_id: str, status: str, current_task: Optional[str] = None
    ) -> Optional[Agent]:
        agent = self.agents.get(agent_id)
        if agent:
            agent.status = status
            agent.current_task = current_task
            self._save_agents()
        return agent

    def get_llm(self, provider: str, model_name: str):
        if provider == "openai":
            if not settings.OPENAI_API_KEY:
                raise ValueError(
                    "OPENAI_API_KEY not set. Please configure your API key in .env"
                )
            return ChatOpenAI(model=model_name, api_key=settings.OPENAI_API_KEY, base_url=settings.OPENAI_BASE_URL)
        elif provider == "anthropic":
            if not settings.ANTHROPIC_API_KEY:
                raise ValueError(
                    "ANTHROPIC_API_KEY not set. Please configure your API key in .env"
                )
            return ChatAnthropic(model=model_name, api_key=settings.ANTHROPIC_API_KEY)
        elif provider == "ollama":
            return ChatOllama(model=model_name, base_url=settings.OLLAMA_BASE_URL)
        else:
            raise ValueError(f"Unknown provider: {provider}")

    def _should_use_openclaw(self) -> bool:
        if not settings.USE_OPENCLAW_FOR_AGENTS:
            return False
        return bool(self.openclaw_bridge and self.openclaw_bridge.is_connected)

    async def chat_async(self, agent_id: str, message: str, task_type: str = "chat") -> str:
        agent = self.get_agent(agent_id)
        if not agent:
            return "Error: Agent not found"

        # Pre-compute memory context (async) before routing to sync or async path
        memory_context = await self._get_memory_context(agent_id, message)

        if self._should_use_openclaw():
            return await self._chat_via_openclaw(agent, message, task_type, memory_context=memory_context)

        return await asyncio.to_thread(self.chat, agent_id, message, task_type, memory_context=memory_context)

    async def _chat_via_openclaw(self, agent: Agent, message: str, task_type: str = "chat", memory_context: str = "") -> str:
        system_prompt = (
            f"You are {agent.name}, a {agent.role} working for HealthDataLab and its sister companies (Altituding, IrisLab, IrisMapper).\n\n"
            f"YOUR GOAL: {agent.goal}\n\n"
            f"YOUR BACKGROUND: {agent.backstory}\n\n"
            f"RESPONSE RULES:\n"
            f"- Give detailed, substantive, actionable responses. Never reply with just one sentence.\n"
            f"- Minimum 3-4 paragraphs for any business question. Use specific examples, data, and recommendations.\n"
            f"- For research tasks: provide structured findings with sources, tables, or numbered lists.\n"
            f"- For content tasks: write the full content ready to publish, not a summary or outline.\n"
            f"- For technical tasks: provide complete code, configs, or step-by-step instructions.\n"
            f"- Use British English. Be professional but direct — no waffle, no filler.\n"
            f"- When asked a casual question like 'hello' or 'how are you', respond briefly BUT then proactively suggest 2-3 specific things you could work on right now based on your role.\n"
            f"- You are a specialist. Act like one. Show your expertise in every response.\n"
            f"- Answer the current user request directly now. Do not include internal reasoning, tool-use notes, or policy/process commentary."
        )

        # Inject memory context (R-Awareness)
        if memory_context:
            system_prompt += f"\n\n{memory_context}"

        result = await self.openclaw_bridge.generate(
            prompt=message,
            system_prompt=system_prompt,
            agent_name=agent.name.lower(),
            timeout=120.0,
        )

        if "error" in result:
            return f"Error: {result['error']}"

        response_text = result.get("response", "")
        input_tokens = result.get("input_tokens", max(len(message) // 4, 1))
        output_tokens = result.get("output_tokens", max(len(response_text) // 4, 1))

        # OpenClaw/Codex OAuth uses flat-rate subscription billing.
        # Skip per-token API cost logging to avoid misreporting usage spend.

        self._save_chat_message(agent.id, "user", message)
        self._save_chat_message(agent.id, "assistant", response_text)

        # Auto-extract memories in background
        self._trigger_memory_extraction(agent.id, message, response_text)

        return response_text

    def chat(self, agent_id: str, message: str, task_type: str = "chat", memory_context: str = "") -> str:
        agent = self.get_agent(agent_id)
        if not agent:
            return "Error: Agent not found"

        try:
            llm = self.get_llm(agent.provider, agent.model_name)
            # Build messages with system prompt for better responses
            from langchain_core.messages import SystemMessage, HumanMessage
            system_content = (
                f"You are {agent.name}, a {agent.role} working for HealthDataLab.\n"
                f"Your goal: {agent.goal}\n"
                f"Your background: {agent.backstory}\n\n"
                f"Give detailed, substantive responses. Minimum 3-4 paragraphs for business questions. "
                f"Use British English. Be professional and direct."
            )

            # Inject memory context (R-Awareness)
            if memory_context:
                system_content += f"\n\n{memory_context}"

            system_msg = SystemMessage(content=system_content)
            human_msg = HumanMessage(content=message)
            response = llm.invoke([system_msg, human_msg])
            response_text = response.content

            # Estimate token counts (rough: 1 token ~ 4 chars)
            input_tokens = max(len(message) // 4, 1)
            output_tokens = max(len(response_text) // 4, 1)

            # Try to get real token usage from response metadata
            if hasattr(response, "usage_metadata") and response.usage_metadata:
                input_tokens = response.usage_metadata.get("input_tokens", input_tokens)
                output_tokens = response.usage_metadata.get("output_tokens", output_tokens)
            elif hasattr(response, "response_metadata"):
                usage = response.response_metadata.get("usage", {})
                if usage:
                    input_tokens = usage.get("prompt_tokens", usage.get("input_tokens", input_tokens))
                    output_tokens = usage.get("completion_tokens", usage.get("output_tokens", output_tokens))

            # Log cost
            if self.cost_tracker:
                self.cost_tracker.log_call(
                    agent_id=agent_id,
                    agent_name=agent.name,
                    provider=agent.provider,
                    model=agent.model_name,
                    input_tokens=input_tokens,
                    output_tokens=output_tokens,
                    source="api",
                    task_type=task_type,
                )

            # Store message and response in chat history
            self._save_chat_message(agent_id, "user", message)
            self._save_chat_message(agent_id, "assistant", response_text)

            # Auto-extract memories in background
            self._trigger_memory_extraction(agent_id, message, response_text)

            return response_text
        except ValueError as e:
            return f"Configuration Error: {str(e)}"
        except Exception as e:
            return f"Error communicating with {agent.provider}: {str(e)}"

    def _save_chat_message(self, agent_id: str, role: str, content: str):
        chat_file = f"{settings.DATA_DIR}/chats/{agent_id}.json"
        os.makedirs(f"{settings.DATA_DIR}/chats", exist_ok=True)

        messages = []
        if os.path.exists(chat_file):
            try:
                with open(chat_file, "r") as f:
                    messages = json.load(f)
            except:
                messages = []

        message = {
            "id": str(uuid.uuid4()),
            "role": role,
            "content": content,
            "agent_id": agent_id,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }
        messages.append(message)

        with open(chat_file, "w") as f:
            json.dump(messages, f, indent=2)

    async def _get_memory_context(self, agent_id: str, message: str) -> str:
        """Build memory context for injection into agent system prompt."""
        if not hasattr(self, "memory_engine") or not self.memory_engine:
            return ""
        try:
            from app.memory_engine import build_context
            return await build_context(
                agent_id,
                message,
                self.memory_engine["knowledge"],
                self.memory_engine["agent_memory"],
                self.memory_engine["corrections"],
            )
        except Exception as e:
            logger.warning(f"Memory context build failed: {e}")
            return ""

    def _trigger_memory_extraction(self, agent_id: str, user_msg: str, assistant_msg: str):
        """Trigger background memory extraction from chat exchange."""
        if not hasattr(self, "memory_engine") or not self.memory_engine:
            return
        try:
            agent_mem_mgr = self.memory_engine["agent_memory"]

            async def _llm_for_extraction(prompt: str) -> str:
                """Lightweight LLM call for memory extraction."""
                agent = self.get_agent(agent_id)
                if not agent:
                    return ""
                try:
                    llm = self.get_llm(agent.provider, agent.model_name)
                    from langchain_core.messages import HumanMessage
                    response = await asyncio.to_thread(
                        llm.invoke, [HumanMessage(content=prompt)]
                    )
                    return response.content
                except Exception:
                    return ""

            # Schedule on the main event loop from thread pool context
            try:
                loop = asyncio.get_event_loop()
                if loop.is_running():
                    loop.call_soon_threadsafe(
                        asyncio.ensure_future,
                        agent_mem_mgr.extract_from_chat(
                            agent_id, user_msg, assistant_msg, _llm_for_extraction
                        ),
                    )
                else:
                    asyncio.create_task(
                        agent_mem_mgr.extract_from_chat(
                            agent_id, user_msg, assistant_msg, _llm_for_extraction
                        )
                    )
            except RuntimeError:
                # No event loop at all — skip
                pass
        except Exception as e:
            logger.warning(f"Failed to trigger memory extraction: {e}")

    def get_chat_history(self, agent_id: str) -> List[dict]:
        chat_file = f"{settings.DATA_DIR}/chats/{agent_id}.json"
        if os.path.exists(chat_file):
            try:
                with open(chat_file, "r") as f:
                    return json.load(f)
            except:
                return []
        return []

    def create_task(self, data: TaskCreate) -> Task:
        task = Task(
            id=str(uuid.uuid4()),
            title=data.title,
            description=data.description,
            agent_id=data.agent_id,
            status="pending",
            created_at=datetime.now(timezone.utc),
            completed_at=None,
            result=None,
        )
        self.tasks[task.id] = task
        self._save_tasks()
        return task

    def list_tasks(self) -> List[Task]:
        return list(self.tasks.values())

    def get_task(self, task_id: str) -> Optional[Task]:
        return self.tasks.get(task_id)

    def run_task(self, task_id: str) -> Dict[str, Any]:
        task = self.get_task(task_id)
        if not task:
            return {"error": "Task not found"}

        agent = self.get_agent(task.agent_id)
        if not agent:
            return {"error": "Agent not found"}

        task.status = "running"
        self._save_tasks()

        try:
            result = self.chat(task.agent_id, task.description, task_type="task")
            task.status = "completed"
            task.completed_at = datetime.now(timezone.utc)
            task.result = result
            self._save_tasks()
            return {
                "task_id": task.id,
                "status": "completed",
                "result": result,
                "agent_name": agent.name,
            }
        except Exception as e:
            task.status = "failed"
            task.completed_at = datetime.now(timezone.utc)
            task.result = str(e)
            self._save_tasks()
            return {"task_id": task.id, "status": "failed", "error": str(e)}

import json
import os
import uuid
from datetime import datetime
from typing import Optional, List, Dict, Any
from app.config import settings
from app.models import Agent, AgentCreate, Task, TaskCreate, ChatMessage
from langchain_openai import ChatOpenAI
from langchain_anthropic import ChatAnthropic
from langchain_community.chat_models import ChatOllama


AVATAR_COLORS = {
    "openai": "#3b6fcc",
    "anthropic": "#c4682d",
    "ollama": "#7c5bbf",
}

DEFAULT_AGENTS = [
    {
        "name": "Scout",
        "role": "Senior Market Research Analyst",
        "goal": "Research competitors, market trends, potential customers, and growth opportunities for HealthDataLab, Altituding, and IrisMapper.",
        "backstory": "Scout is a seasoned market research analyst with deep expertise in identifying market opportunities and competitor intelligence.",
        "provider": "openai",
        "model_name": "gpt-4o",
        "avatar_color": "#3b6fcc",
    },
    {
        "name": "Quill",
        "role": "Content Strategist & Writer",
        "goal": "Create compelling blog posts, social media content, email sequences, and SEO content that drives traffic and conversions.",
        "backstory": "Quill is a world-class content strategist and writer with years of experience creating viral content and driving engagement.",
        "provider": "anthropic",
        "model_name": "claude-sonnet-4-20250514",
        "avatar_color": "#c4682d",
    },
    {
        "name": "Forge",
        "role": "Senior Full-Stack Developer",
        "goal": "Build features, fix bugs, create prototypes, and ship code for our websites.",
        "backstory": "Forge is a senior full-stack developer with expertise in building scalable applications and shipping fast.",
        "provider": "anthropic",
        "model_name": "claude-sonnet-4-20250514",
        "avatar_color": "#7c5bbf",
    },
    {
        "name": "Radar",
        "role": "Business Development Representative",
        "goal": "Find potential leads, draft outreach messages, identify partnership opportunities, and track sales pipeline.",
        "backstory": "Radar is a world-class business development representative with a proven track record of closing deals and building relationships.",
        "provider": "openai",
        "model_name": "gpt-4o",
        "avatar_color": "#1d8fa0",
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
                        )
                        self.agents[agent_id] = Agent(**agent_data)
            except Exception as e:
                print(f"Error loading agents: {e}")
                self._create_default_agents()
        else:
            self._create_default_agents()

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
                created_at=datetime.now(),
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
                        )
                        if task_data.get("completed_at"):
                            task_data["completed_at"] = datetime.fromisoformat(
                                task_data["completed_at"]
                            )
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
            created_at=datetime.now(),
        )
        self.agents[agent.id] = agent
        self._save_agents()
        return agent

    def list_agents(self) -> List[Agent]:
        return list(self.agents.values())

    def get_agent(self, agent_id: str) -> Optional[Agent]:
        return self.agents.get(agent_id)

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
            return ChatOpenAI(model=model_name, api_key=settings.OPENAI_API_KEY)
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

    def chat(self, agent_id: str, message: str, task_type: str = "chat") -> str:
        agent = self.get_agent(agent_id)
        if not agent:
            return "Error: Agent not found"

        try:
            llm = self.get_llm(agent.provider, agent.model_name)
            response = llm.invoke(message)
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
            "timestamp": datetime.now().isoformat(),
        }
        messages.append(message)

        with open(chat_file, "w") as f:
            json.dump(messages, f, indent=2)

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
            created_at=datetime.now(),
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
            task.completed_at = datetime.now()
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
            task.completed_at = datetime.now()
            task.result = str(e)
            self._save_tasks()
            return {"task_id": task.id, "status": "failed", "error": str(e)}

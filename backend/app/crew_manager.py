import json
import os
import uuid
from datetime import datetime
from typing import Optional, List
from app.config import settings
from app.models import Crew, CrewCreate

try:
    from crewai import Agent as CrewAIAgent, Task as CrewAITask, Crew as CrewAICrew
except ImportError:
    CrewAIAgent = None
    CrewAITask = None
    CrewAICrew = None


class CrewManager:
    def __init__(self, agent_manager, ws_manager):
        self.agent_manager = agent_manager
        self.ws_manager = ws_manager
        self.crews_file = f"{settings.DATA_DIR}/crews.json"
        self.crews: dict = {}
        self._load_crews()

    def _load_crews(self):
        if os.path.exists(self.crews_file):
            try:
                with open(self.crews_file, "r") as f:
                    data = json.load(f)
                    self.crews = data
            except:
                self.crews = {}
        else:
            self.crews = {}

    def _save_crews(self):
        os.makedirs(settings.DATA_DIR, exist_ok=True)
        with open(self.crews_file, "w") as f:
            json.dump(self.crews, f, indent=2)

    def create_crew(self, data: CrewCreate) -> Crew:
        crew_id = str(uuid.uuid4())
        crew = Crew(
            id=crew_id,
            name=data.name,
            agent_ids=data.agent_ids,
            task_descriptions=data.task_descriptions,
            process_type=data.process_type,
            status="pending",
            created_at=datetime.now(),
            results=None,
        )

        crew_dict = crew.model_dump(mode="json")
        crew_dict["created_at"] = crew.created_at.isoformat()

        self.crews[crew_id] = crew_dict
        self._save_crews()

        return crew

    def list_crews(self) -> List[dict]:
        return list(self.crews.values())

    def get_crew(self, crew_id: str) -> Optional[dict]:
        return self.crews.get(crew_id)

    async def run_crew(self, crew_id: str):
        crew_data = self.get_crew(crew_id)
        if not crew_data:
            return {"error": "Crew not found"}

        # Update status to running
        crew_data["status"] = "running"
        self._save_crews()

        await self.ws_manager.broadcast(
            "crew_status",
            {"crew_id": crew_id, "status": "running", "name": crew_data["name"]},
        )

        try:
            # If CrewAI is not available, use agent chat as fallback
            if CrewAIAgent is None:
                return await self._run_crew_fallback(crew_id, crew_data)

            # Build CrewAI agents and tasks
            crew_agents = []
            for agent_id in crew_data["agent_ids"]:
                agent = self.agent_manager.get_agent(agent_id)
                if agent:
                    llm = self.agent_manager.get_llm(agent.provider, agent.model_name)
                    crew_ai_agent = CrewAIAgent(
                        role=agent.role,
                        goal=agent.goal,
                        backstory=agent.backstory,
                        llm=llm,
                    )
                    crew_agents.append(crew_ai_agent)

            # Create tasks
            tasks = []
            for i, task_desc in enumerate(crew_data["task_descriptions"]):
                if i < len(crew_agents):
                    task = CrewAITask(
                        description=task_desc,
                        agent=crew_agents[i],
                        expected_output=f"Completed: {task_desc}",
                    )
                    tasks.append(task)

            if not tasks:
                crew_data["status"] = "failed"
                crew_data["results"] = "No valid agents or tasks"
                self._save_crews()
                return {"error": "No valid agents or tasks"}

            # Create and run crew
            crew = CrewAICrew(
                agents=crew_agents,
                tasks=tasks,
                process=crew_data["process_type"],
            )

            result = crew.kickoff()
            result_str = str(result) if result else ""

            crew_data["status"] = "completed"
            crew_data["results"] = result_str
            self._save_crews()

            await self.ws_manager.broadcast(
                "crew_completed",
                {
                    "crew_id": crew_id,
                    "status": "completed",
                    "name": crew_data["name"],
                    "result": result_str[:200],
                },
            )

            return {"crew_id": crew_id, "status": "completed", "result": result_str}

        except Exception as e:
            crew_data["status"] = "failed"
            crew_data["results"] = str(e)
            self._save_crews()

            await self.ws_manager.broadcast(
                "crew_error",
                {
                    "crew_id": crew_id,
                    "status": "failed",
                    "name": crew_data["name"],
                    "error": str(e),
                },
            )

            return {"crew_id": crew_id, "status": "failed", "error": str(e)}

    async def _run_crew_fallback(self, crew_id: str, crew_data: dict):
        """Fallback if CrewAI is not available: just run agents sequentially"""
        results = []

        for i, agent_id in enumerate(crew_data["agent_ids"]):
            if i >= len(crew_data["task_descriptions"]):
                break

            task_desc = crew_data["task_descriptions"][i]
            agent = self.agent_manager.get_agent(agent_id)

            if not agent:
                continue

            try:
                result = self.agent_manager.chat(agent_id, task_desc)
                results.append(f"{agent.name}: {result}")

                await self.ws_manager.broadcast(
                    "crew_task_progress",
                    {
                        "crew_id": crew_id,
                        "task_index": i,
                        "total_tasks": len(crew_data["task_descriptions"]),
                        "agent_name": agent.name,
                    },
                )
            except Exception as e:
                results.append(f"{agent.name}: Error - {str(e)}")

        crew_data["status"] = "completed"
        crew_data["results"] = "\n".join(results)
        self._save_crews()

        await self.ws_manager.broadcast(
            "crew_completed",
            {
                "crew_id": crew_id,
                "status": "completed",
                "name": crew_data["name"],
                "result": crew_data["results"][:200],
            },
        )

        return {
            "crew_id": crew_id,
            "status": "completed",
            "result": crew_data["results"],
        }

import asyncio
import json
import os
from contextlib import asynccontextmanager
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

from app.config import settings
from app.models import (
    AgentCreate,
    TaskCreate,
    CrewCreate,
    MemoryCreate,
    JournalCreate,
    DocumentCreate,
    ScheduledJobCreate,
    ChatRequest,
)
from app.websocket_manager import ws_manager
from app.agents import AgentManager
from app.memory import MemoryManager
from app.documents import DocumentManager
from app.scheduler import SchedulerManager
from app.crew_manager import CrewManager
from app.cost_tracker import CostTracker
from app.openclaw_bridge import OpenClawBridge

# Initialize managers
agent_manager = AgentManager()
cost_tracker = CostTracker()
agent_manager.cost_tracker = cost_tracker
memory_manager = MemoryManager()
document_manager = DocumentManager()
scheduler_manager = SchedulerManager(agent_manager, document_manager, ws_manager)
crew_manager = CrewManager(agent_manager, ws_manager)
openclaw_bridge = OpenClawBridge(ws_manager=ws_manager, cost_tracker=cost_tracker)
agent_manager.openclaw_bridge = openclaw_bridge


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    os.makedirs(f"{settings.DATA_DIR}/memories", exist_ok=True)
    os.makedirs(f"{settings.DATA_DIR}/journals", exist_ok=True)
    os.makedirs(f"{settings.DATA_DIR}/documents", exist_ok=True)
    os.makedirs(f"{settings.DATA_DIR}/crew_logs", exist_ok=True)
    os.makedirs(f"{settings.DATA_DIR}/chats", exist_ok=True)
    scheduler_manager.start()
    # Try connecting to OpenClaw Gateway (non-blocking — OK if not running)
    asyncio.create_task(openclaw_bridge.connect())
    yield
    # Shutdown
    scheduler_manager.shutdown()
    await openclaw_bridge.disconnect()


app = FastAPI(title="The Lab", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# WebSocket
@app.websocket("/ws")
async def websocket_endpoint(ws: WebSocket):
    await ws_manager.connect(ws)
    try:
        while True:
            data = await ws.receive_text()
            # Echo or handle client messages if needed
    except WebSocketDisconnect:
        ws_manager.disconnect(ws)


# Health
@app.get("/api/health")
async def health():
    return {"status": "ok", "agents": len(agent_manager.list_agents())}


# --- AGENT ENDPOINTS ---
@app.get("/api/agents")
async def list_agents():
    agents = agent_manager.list_agents()
    return [agent.model_dump(mode="json") for agent in agents]


@app.post("/api/agents")
async def create_agent(data: AgentCreate):
    agent = agent_manager.create_agent(data)
    await ws_manager.broadcast("agent_created", agent.model_dump(mode="json"))
    return agent.model_dump(mode="json")


@app.get("/api/agents/{agent_id}")
async def get_agent(agent_id: str):
    agent = agent_manager.get_agent(agent_id)
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    return agent.model_dump(mode="json")


@app.delete("/api/agents/{agent_id}")
async def delete_agent(agent_id: str):
    agent_manager.delete_agent(agent_id)
    await ws_manager.broadcast("agent_deleted", {"id": agent_id})
    return {"status": "deleted"}


@app.patch("/api/agents/{agent_id}")
async def update_agent(agent_id: str, data: dict):
    status = data.get("status", "idle")
    task = data.get("current_task")
    agent = agent_manager.update_status(agent_id, status, task)
    if agent:
        await ws_manager.broadcast("agent_status", agent.model_dump(mode="json"))
        return agent.model_dump(mode="json")
    raise HTTPException(status_code=404, detail="Agent not found")


# --- CHAT ENDPOINTS ---
@app.post("/api/chat")
async def chat(data: ChatRequest):
    agent = agent_manager.get_agent(data.agent_id)
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")

    # Update status
    agent_manager.update_status(
        data.agent_id, "working", f"Responding to chat"
    )
    await ws_manager.broadcast(
        "agent_status",
        {
            **agent.model_dump(mode="json"),
            "status": "working",
            "current_task": "Responding to chat",
        },
    )

    try:
        response = await agent_manager.chat_async(
            data.agent_id, data.message
        )
        agent_manager.update_status(data.agent_id, "idle", None)
        await ws_manager.broadcast(
            "agent_status",
            {**agent.model_dump(mode="json"), "status": "idle", "current_task": None},
        )
        await ws_manager.broadcast(
            "task_completed",
            {
                "agent_id": data.agent_id,
                "agent_name": agent.name,
                "task": "Chat response",
                "result": response[:100],
            },
        )
        return {"response": response, "agent_id": data.agent_id}
    except Exception as e:
        agent_manager.update_status(data.agent_id, "error", str(e))
        await ws_manager.broadcast(
            "agent_status",
            {**agent.model_dump(mode="json"), "status": "error", "current_task": str(e)},
        )
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/chat/{agent_id}/history")
async def chat_history(agent_id: str):
    return agent_manager.get_chat_history(agent_id)


# --- TASK ENDPOINTS ---
@app.get("/api/tasks")
async def list_tasks():
    tasks = agent_manager.list_tasks()
    return [task.model_dump(mode="json") for task in tasks]


@app.post("/api/tasks")
async def create_task(data: TaskCreate):
    task = agent_manager.create_task(data)
    await ws_manager.broadcast("task_created", task.model_dump(mode="json"))
    return task.model_dump(mode="json")


@app.get("/api/tasks/{task_id}")
async def get_task(task_id: str):
    task = agent_manager.get_task(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    return task.model_dump(mode="json")


@app.post("/api/tasks/{task_id}/run")
async def run_task(task_id: str):
    result = await asyncio.to_thread(agent_manager.run_task, task_id)
    await ws_manager.broadcast("task_completed", result)
    return result


# --- CREW ENDPOINTS ---
@app.get("/api/crews")
async def list_crews():
    return crew_manager.list_crews()


@app.post("/api/crews")
async def create_crew(data: CrewCreate):
    crew = crew_manager.create_crew(data)
    # Run in background
    asyncio.create_task(crew_manager.run_crew(crew.id))
    return crew.model_dump(mode="json")


@app.get("/api/crews/{crew_id}")
async def get_crew(crew_id: str):
    crew = crew_manager.get_crew(crew_id)
    if not crew:
        raise HTTPException(status_code=404, detail="Crew not found")
    return crew


# --- MEMORY ENDPOINTS ---
@app.get("/api/memory")
async def list_memories(date: str = None, tag: str = None, search: str = None):
    memories = memory_manager.get_memories(date, tag, search)
    return [memory.model_dump(mode="json") for memory in memories]


@app.post("/api/memory")
async def add_memory(data: MemoryCreate):
    entry = memory_manager.add_memory(data)
    await ws_manager.broadcast("memory_added", entry.model_dump(mode="json"))
    return entry.model_dump(mode="json")


@app.get("/api/memory/journals")
async def list_journals(limit: int = 30):
    journals = memory_manager.get_journals(limit)
    return [journal.model_dump(mode="json") for journal in journals]


@app.get("/api/memory/journals/{date}")
async def get_journal(date: str):
    journal = memory_manager.get_journal(date)
    if not journal:
        raise HTTPException(status_code=404, detail="Journal not found")
    return journal.model_dump(mode="json")


@app.post("/api/memory/journals")
async def create_journal(data: JournalCreate):
    entry = memory_manager.create_journal(data)
    return entry.model_dump(mode="json")


# --- DOCUMENT ENDPOINTS ---
@app.get("/api/documents")
async def list_documents():
    docs = document_manager.list_documents()
    return [doc.model_dump(mode="json") for doc in docs]


@app.post("/api/documents")
async def create_document(data: DocumentCreate):
    doc = document_manager.create_document(data)
    await ws_manager.broadcast("document_created", doc.model_dump(mode="json"))
    return doc.model_dump(mode="json")


@app.get("/api/documents/{doc_id}")
async def get_document(doc_id: str):
    doc = document_manager.get_document(doc_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    return doc.model_dump(mode="json")


# --- SCHEDULE ENDPOINTS ---
@app.get("/api/schedule")
async def list_schedule():
    return scheduler_manager.list_jobs()


@app.post("/api/schedule")
async def create_schedule(data: ScheduledJobCreate):
    job = scheduler_manager.add_job(data)
    return job.model_dump(mode="json")


@app.delete("/api/schedule/{job_id}")
async def delete_schedule(job_id: str):
    scheduler_manager.remove_job(job_id)
    return {"status": "deleted"}


@app.patch("/api/schedule/{job_id}")
async def toggle_schedule(job_id: str):
    job = scheduler_manager.toggle_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return job.model_dump(mode="json")


@app.get("/api/calendar")
async def get_calendar(days: int = 30):
    return scheduler_manager.get_calendar(days)


@app.post("/api/schedule/{job_id}/run")
async def run_schedule_now(job_id: str):
    result = await asyncio.to_thread(scheduler_manager.run_job_now, job_id)
    return result


# --- COST TRACKING ENDPOINTS ---
@app.get("/api/costs/summary")
async def cost_summary(days: int = 30):
    return cost_tracker.get_summary(days)


@app.get("/api/costs/recent")
async def cost_recent(limit: int = 50):
    return cost_tracker.get_recent_calls(limit)


@app.get("/api/costs/scorecard")
async def cost_scorecard(days: int = 7):
    return cost_tracker.get_scorecard(days)


@app.get("/api/costs/today")
async def cost_today():
    return {
        "spend_usd": round(cost_tracker.get_today_spend(), 4),
        "budget_usd": cost_tracker.daily_budget,
        "over_budget": cost_tracker.is_over_budget(),
    }


# --- SETTINGS ENDPOINTS ---
@app.get("/api/settings")
async def get_settings():
    return {
        "openai_key_set": bool(settings.OPENAI_API_KEY),
        "anthropic_key_set": bool(settings.ANTHROPIC_API_KEY),
        "ollama_base_url": settings.OLLAMA_BASE_URL,
        "daily_budget_usd": cost_tracker.daily_budget,
        "server_host": settings.SERVER_HOST,
        "server_port": settings.SERVER_PORT,
        "use_openclaw_for_agents": settings.USE_OPENCLAW_FOR_AGENTS,
        "openclaw_connected": openclaw_bridge.is_connected,
        "openclaw_llm_active": settings.USE_OPENCLAW_FOR_AGENTS and openclaw_bridge.is_connected,
    }


@app.post("/api/settings/budget")
async def update_budget(data: dict):
    new_budget = data.get("daily_budget_usd")
    if new_budget is not None and isinstance(new_budget, (int, float)) and new_budget >= 0:
        cost_tracker.daily_budget = float(new_budget)
        return {"daily_budget_usd": cost_tracker.daily_budget}
    raise HTTPException(status_code=400, detail="Invalid budget value")


# --- OPENCLAW ENDPOINTS ---
@app.get("/api/openclaw/status")
async def openclaw_status():
    return await openclaw_bridge.get_status()


@app.post("/api/openclaw/connect")
async def openclaw_connect():
    await openclaw_bridge.connect()
    return await openclaw_bridge.get_status()


@app.post("/api/openclaw/disconnect")
async def openclaw_disconnect():
    await openclaw_bridge.disconnect()
    return {"status": "disconnected"}


@app.get("/api/openclaw/sessions")
async def openclaw_sessions():
    sessions = await openclaw_bridge.list_sessions()
    return sessions


@app.get("/api/openclaw/sessions/{session_id}/history")
async def openclaw_session_history(session_id: str):
    history = await openclaw_bridge.get_session_history(session_id)
    return history


@app.post("/api/openclaw/sessions/{session_id}/send")
async def openclaw_send_message(session_id: str, data: dict):
    text = data.get("message", "")
    if not text:
        raise HTTPException(status_code=400, detail="Message is required")
    result = await openclaw_bridge.send_message(session_id, text)
    return result


@app.post("/api/openclaw/sessions")
async def openclaw_create_session(data: dict):
    name = data.get("name")
    result = await openclaw_bridge.create_session(name)
    return result


@app.get("/api/openclaw/activity")
async def openclaw_activity(limit: int = 50):
    return openclaw_bridge.get_activity(limit)


@app.get("/api/openclaw/providers")
async def openclaw_providers():
    return await openclaw_bridge.get_provider_info()


@app.post("/api/openclaw/settings")
async def openclaw_update_settings(data: dict):
    if "gateway_url" in data:
        openclaw_bridge.gateway_url = data["gateway_url"]
    if "gateway_token" in data:
        openclaw_bridge.gateway_token = data["gateway_token"]
    # Reconnect with new settings
    await openclaw_bridge.disconnect()
    await openclaw_bridge.connect()
    return await openclaw_bridge.get_status()


# --- STATIC FILES (serve frontend) ---
# Navigate from backend/app/ → backend/ → project root → frontend/dist
_app_dir = os.path.dirname(os.path.abspath(__file__))          # backend/app/
_backend_dir = os.path.dirname(_app_dir)                        # backend/
_project_dir = os.path.dirname(_backend_dir)                    # project root
frontend_dir = os.path.join(_project_dir, "frontend", "dist")
# Fallback to dist-v3 or dist-new if dist is locked/stale
if not os.path.isdir(frontend_dir) or not os.path.isfile(os.path.join(frontend_dir, "index.html")):
    for alt_name in ("dist-v4", "dist-v3", "dist-new"):
        alt_dir = os.path.join(_project_dir, "frontend", alt_name)
        if os.path.isdir(alt_dir) and os.path.isfile(os.path.join(alt_dir, "index.html")):
            frontend_dir = alt_dir
            break
if os.path.isdir(frontend_dir):
    app.mount("/assets", StaticFiles(directory=os.path.join(frontend_dir, "assets")), name="assets")

    @app.get("/{path:path}")
    async def serve_frontend(path: str):
        file_path = os.path.join(frontend_dir, path)
        if os.path.isfile(file_path):
            return FileResponse(file_path)
        return FileResponse(os.path.join(frontend_dir, "index.html"))

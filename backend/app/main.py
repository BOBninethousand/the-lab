import asyncio
import json
import os
import uuid
from contextlib import asynccontextmanager
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException, Body, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, StreamingResponse
import httpx

from app.config import settings
from app.models import (
    AgentCreate,
    TaskCreate,
    CrewCreate,
    MemoryCreate,
    JournalCreate,
    DocumentCreate,
    ScheduledJobCreate,
    ScheduledJobCreateSimple,
    ChatRequest,
    ReportCreate,
    KnowledgeCreate,
    CorrectionCreate,
)
from app.websocket_manager import ws_manager
from app.agents import AgentManager
from app.memory import MemoryManager
from app.documents import DocumentManager, ReportManager
from app.scheduler import SchedulerManager
from app.crew_manager import CrewManager
from app.cost_tracker import CostTracker
from app.openclaw_bridge import OpenClawBridge
from app.embeddings import EmbeddingManager
from app.memory_engine import (
    KnowledgeBaseManager,
    AgentMemoryManager,
    CorrectionManager,
    build_context,
    get_memory_stats,
)
from app.notion_bridge import NotionBridge

# Initialize managers
agent_manager = AgentManager()
cost_tracker = CostTracker()
agent_manager.cost_tracker = cost_tracker
memory_manager = MemoryManager()
document_manager = DocumentManager()
report_manager = ReportManager()
scheduler_manager = SchedulerManager(agent_manager, document_manager, ws_manager)
crew_manager = CrewManager(agent_manager, ws_manager)
openclaw_bridge = OpenClawBridge(ws_manager=ws_manager, cost_tracker=cost_tracker)
agent_manager.openclaw_bridge = openclaw_bridge

# Memory system managers
embedding_manager = EmbeddingManager()
knowledge_manager = KnowledgeBaseManager(embedding_manager)
agent_memory_manager = AgentMemoryManager(embedding_manager)
correction_manager = CorrectionManager(embedding_manager, knowledge_manager)

# Wire memory engine into agent manager for context injection
agent_manager.memory_engine = {
    "knowledge": knowledge_manager,
    "agent_memory": agent_memory_manager,
    "corrections": correction_manager,
    "build_context": build_context,
}

# Wire correction manager into scheduler for feedback → correction pipeline
scheduler_manager.correction_manager = correction_manager

# Notion integration
notion_bridge = NotionBridge()
scheduler_manager.notion_bridge = notion_bridge


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    os.makedirs(f"{settings.DATA_DIR}/memories", exist_ok=True)
    os.makedirs(f"{settings.DATA_DIR}/journals", exist_ok=True)
    os.makedirs(f"{settings.DATA_DIR}/documents", exist_ok=True)
    os.makedirs(f"{settings.DATA_DIR}/crew_logs", exist_ok=True)
    os.makedirs(f"{settings.DATA_DIR}/chats", exist_ok=True)
    os.makedirs(f"{settings.DATA_DIR}/reports", exist_ok=True)
    os.makedirs(f"{settings.DATA_DIR}/knowledge", exist_ok=True)
    os.makedirs(f"{settings.DATA_DIR}/agent_memory", exist_ok=True)
    os.makedirs(f"{settings.DATA_DIR}/corrections", exist_ok=True)
    os.makedirs(f"{settings.DATA_DIR}/job_executions", exist_ok=True)
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


# --- KNOWLEDGE BASE ENDPOINTS ---
@app.get("/api/knowledge/search")
async def search_knowledge(q: str = ""):
    if not q:
        return []
    results = await knowledge_manager.search_semantic(q, top_k=10)
    return [r.model_dump(mode="json") for r in results]


@app.get("/api/knowledge")
async def list_knowledge(category: str = None, tag: str = None, search: str = None):
    entries = knowledge_manager.get_all(category, tag, search)
    return [e.model_dump(mode="json") for e in entries]


@app.post("/api/knowledge")
async def create_knowledge(data: KnowledgeCreate):
    entry = await knowledge_manager.add(data)
    await ws_manager.broadcast("knowledge_added", entry.model_dump(mode="json"))
    return entry.model_dump(mode="json")


@app.post("/api/knowledge/bulk")
async def bulk_import_knowledge(entries: list = Body(...)):
    """Import multiple knowledge base entries at once.
    Accepts JSON array of {title, content, tags (comma-string or list), category}.
    Deduplicates by title match.
    """
    existing = knowledge_manager.get_all()
    existing_titles = {e.title.lower().strip() for e in existing}

    created = 0
    skipped = 0
    errors = []

    for i, raw in enumerate(entries):
        try:
            title = raw.get("title", "").strip()
            if not title:
                errors.append(f"Entry {i}: missing title")
                continue

            if title.lower() in existing_titles:
                skipped += 1
                continue

            # Convert comma-separated tags string to list
            tags = raw.get("tags", [])
            if isinstance(tags, str):
                tags = [t.strip() for t in tags.split(",") if t.strip()]

            data = KnowledgeCreate(
                title=title,
                content=raw.get("content", ""),
                tags=tags,
                category=raw.get("category", "fact"),
            )
            entry = await knowledge_manager.add(data)
            existing_titles.add(title.lower())
            created += 1
        except Exception as e:
            errors.append(f"Entry {i} ({raw.get('title', '?')}): {str(e)}")

    if created > 0:
        await ws_manager.broadcast("knowledge_added", {"bulk_imported": created})

    return {"created": created, "skipped": skipped, "errors": errors}


@app.post("/api/knowledge/import-files")
async def import_knowledge_files(file_entries: list = Body(...)):
    """Import .md files from disk as knowledge entries.
    Accepts JSON array of {title, file_path, tags (list), category}.
    Reads file content from the given path.
    """
    existing = knowledge_manager.get_all()
    existing_titles = {e.title.lower().strip() for e in existing}

    created = 0
    skipped = 0
    errors = []

    for i, raw in enumerate(file_entries):
        try:
            title = raw.get("title", "").strip()
            file_path = raw.get("file_path", "").strip()

            if not title or not file_path:
                errors.append(f"Entry {i}: missing title or file_path")
                continue

            if title.lower() in existing_titles:
                skipped += 1
                continue

            if not os.path.exists(file_path):
                errors.append(f"Entry {i} ({title}): file not found: {file_path}")
                continue

            with open(file_path, "r", encoding="utf-8") as f:
                content = f.read()

            tags = raw.get("tags", [])
            if isinstance(tags, str):
                tags = [t.strip() for t in tags.split(",") if t.strip()]

            data = KnowledgeCreate(
                title=title,
                content=content,
                tags=tags,
                category=raw.get("category", "reference"),
            )
            entry = await knowledge_manager.add(data)
            existing_titles.add(title.lower())
            created += 1
        except Exception as e:
            errors.append(f"Entry {i} ({raw.get('title', '?')}): {str(e)}")

    if created > 0:
        await ws_manager.broadcast("knowledge_added", {"bulk_imported": created})

    return {"created": created, "skipped": skipped, "errors": errors}


@app.get("/api/knowledge/{entry_id}")
async def get_knowledge(entry_id: str):
    entry = knowledge_manager.get(entry_id)
    if not entry:
        raise HTTPException(status_code=404, detail="Knowledge entry not found")
    return entry.model_dump(mode="json")


@app.put("/api/knowledge/{entry_id}")
async def update_knowledge(entry_id: str, data: dict):
    entry = await knowledge_manager.update(entry_id, data)
    if not entry:
        raise HTTPException(status_code=404, detail="Knowledge entry not found")
    return entry.model_dump(mode="json")


@app.delete("/api/knowledge/{entry_id}")
async def delete_knowledge(entry_id: str):
    if not knowledge_manager.delete(entry_id):
        raise HTTPException(status_code=404, detail="Knowledge entry not found")
    return {"status": "deleted"}


# --- AGENT MEMORY ENDPOINTS ---
@app.get("/api/agents/{agent_id}/enhanced-prompt")
async def get_enhanced_prompt(agent_id: str, task: str = ""):
    """Returns agent's system prompt with injected memory context. Used by n8n."""
    agent = agent_manager.get_agent(agent_id)
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    memory_context = await agent_manager._get_memory_context(agent_id, task or agent.goal)
    system_prompt = (
        f"You are {agent.name}, a {agent.role} working for HealthDataLab.\n"
        f"Your goal: {agent.goal}\n"
        f"Your background: {agent.backstory}\n\n"
        f"Give detailed, substantive responses. Use British English. Be professional and direct."
    )
    if memory_context:
        system_prompt += f"\n\n{memory_context}"
    memory_count = agent_memory_manager.count(agent_id)
    rules_count = len(correction_manager.get_rules(agent_id))
    return {
        "agent_name": agent.name,
        "system_prompt": system_prompt,
        "memory_count": memory_count,
        "rules_count": rules_count,
        "has_memory": memory_count > 0 or rules_count > 0,
    }


@app.get("/api/agents/{agent_id}/memories/search")
async def search_agent_memories(agent_id: str, q: str = ""):
    if not q:
        return []
    results = await agent_memory_manager.search_for_agent(agent_id, q, top_k=10)
    return [r.model_dump(mode="json") for r in results]


@app.get("/api/agents/{agent_id}/memories")
async def list_agent_memories(agent_id: str):
    entries = agent_memory_manager.get_for_agent(agent_id)
    return [e.model_dump(mode="json") for e in entries]


@app.delete("/api/agents/{agent_id}/memories/{memory_id}")
async def delete_agent_memory(agent_id: str, memory_id: str):
    if not agent_memory_manager.delete(agent_id, memory_id):
        raise HTTPException(status_code=404, detail="Memory not found")
    return {"status": "deleted"}


# --- CORRECTION ENDPOINTS ---
@app.post("/api/corrections")
async def create_correction(data: CorrectionCreate):
    entry = await correction_manager.add(data)
    await ws_manager.broadcast("correction_added", entry.model_dump(mode="json"))
    return entry.model_dump(mode="json")


@app.get("/api/corrections/{agent_id}")
async def list_corrections(agent_id: str):
    entries = correction_manager.get_for_agent(agent_id)
    return [e.model_dump(mode="json") for e in entries]


@app.get("/api/corrections/{agent_id}/rules")
async def list_correction_rules(agent_id: str):
    rules = correction_manager.get_rules(agent_id)
    return [r.model_dump(mode="json") for r in rules]


# --- MEMORY STATS ENDPOINT ---
@app.get("/api/memory/stats")
async def memory_stats():
    return get_memory_stats(knowledge_manager, agent_memory_manager, correction_manager).model_dump(mode="json")


@app.post("/api/memory/compress")
async def compress_memories(data: dict = {}):
    """Compress old memories into weekly digests. Call weekly via n8n or manually."""
    days_threshold = data.get("days", 7)
    results = {}
    for agent_dir in agent_memory_manager.agents_with_memory():
        memories = agent_memory_manager.get_for_agent(agent_dir)
        old_memories = [
            m for m in memories
            if (datetime.now() - datetime.fromisoformat(str(m.created_at))).days > days_threshold
        ]
        if len(old_memories) < 3:
            results[agent_dir] = {"compressed": 0, "reason": "not enough old memories"}
            continue

        # Summarize old memories into one digest
        combined = "\n".join(f"- [{m.memory_type}] {m.content}" for m in old_memories[:20])
        digest_content = f"Weekly memory digest ({len(old_memories)} memories compressed):\n{combined[:1500]}"

        # Save digest as a single memory
        await agent_memory_manager.add(
            agent_dir, digest_content, "learning", ["weekly-digest"]
        )

        # Delete the old individual memories
        for m in old_memories:
            agent_memory_manager.delete(agent_dir, m.id)

        results[agent_dir] = {"compressed": len(old_memories), "digest_created": True}

    return results


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


# --- REPORT ENDPOINTS ---
@app.get("/api/reports/stats")
async def report_stats():
    return report_manager.get_stats()


@app.get("/api/reports")
async def list_reports(
    agent_name: str = None,
    report_type: str = None,
    starred: bool = None,
    search: str = None,
    limit: int = 50,
    offset: int = 0,
):
    reports = report_manager.list_reports(
        agent_name=agent_name,
        report_type=report_type,
        starred=starred,
        search=search,
        limit=limit,
        offset=offset,
    )
    return [r.model_dump(mode="json") for r in reports]


@app.post("/api/reports")
async def create_report(data: ReportCreate):
    report = report_manager.create_report(data)
    await ws_manager.broadcast("report_created", report.model_dump(mode="json"))
    # Auto-publish to Notion + extract learnings for memory
    if notion_bridge.configured:
        asyncio.create_task(_publish_report_to_notion(report))
    asyncio.create_task(_extract_report_learnings(report))
    return report.model_dump(mode="json")


async def _publish_report_to_notion(report):
    """Background task to publish a report to Notion."""
    try:
        url = await notion_bridge.publish_report(
            title=report.title,
            content=report.content,
            agent_name=report.agent_name,
            report_type=report.report_type,
            source=report.source,
        )
        if url:
            report_manager.update_report(report.id, {"notion_page_url": url})
    except Exception as e:
        import logging
        logging.getLogger(__name__).warning(f"Notion auto-publish failed: {e}")


async def _extract_report_learnings(report):
    """Extract key insights from a report and save as agent memories."""
    try:
        async def _llm_for_extraction(prompt: str) -> str:
            agent = agent_manager.get_agent(report.agent_id)
            if not agent:
                return ""
            llm = agent_manager.get_llm(agent.provider, agent.model_name)
            from langchain_core.messages import HumanMessage
            response = await asyncio.to_thread(llm.invoke, [HumanMessage(content=prompt)])
            return response.content

        await agent_memory_manager.extract_from_report(
            agent_id=report.agent_id,
            report_content=report.content,
            report_type=report.report_type,
            agent_name=report.agent_name,
            llm_func=_llm_for_extraction,
        )
    except Exception as e:
        import logging
        logging.getLogger(__name__).warning(f"Report learning extraction failed: {e}")


@app.post("/api/reports/generate")
async def generate_report(data: dict):
    agent_id = data.get("agent_id")
    title = data.get("title", "Untitled Report")
    report_type = data.get("report_type", "briefing")
    prompt = data.get("prompt", "")

    agent = agent_manager.get_agent(agent_id)
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")

    # Update agent status
    agent_manager.update_status(agent_id, "working", f"Generating report: {title}")
    await ws_manager.broadcast(
        "agent_status",
        {**agent.model_dump(mode="json"), "status": "working", "current_task": f"Generating report: {title}"},
    )

    try:
        response = await agent_manager.chat_async(agent_id, prompt, task_type="report")

        agent_manager.update_status(agent_id, "idle", None)
        await ws_manager.broadcast(
            "agent_status",
            {**agent.model_dump(mode="json"), "status": "idle", "current_task": None},
        )

        report_data = ReportCreate(
            title=title,
            content=response,
            report_type=report_type,
            agent_id=agent_id,
            agent_name=agent.name,
            source="scheduled",
        )
        report = report_manager.create_report(report_data)
        await ws_manager.broadcast("report_created", report.model_dump(mode="json"))
        # Auto-publish to Notion + extract learnings for memory
        if notion_bridge.configured:
            asyncio.create_task(_publish_report_to_notion(report))
        asyncio.create_task(_extract_report_learnings(report))
        return report.model_dump(mode="json")
    except Exception as e:
        agent_manager.update_status(agent_id, "error", str(e))
        await ws_manager.broadcast(
            "agent_status",
            {**agent.model_dump(mode="json"), "status": "error", "current_task": str(e)},
        )
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/reports/{report_id}")
async def get_report(report_id: str):
    report = report_manager.get_report(report_id)
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")
    return report.model_dump(mode="json")


@app.patch("/api/reports/{report_id}")
async def update_report(report_id: str, data: dict):
    report = report_manager.update_report(report_id, data)
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")
    return report.model_dump(mode="json")


@app.delete("/api/reports/{report_id}")
async def delete_report(report_id: str):
    if not report_manager.delete_report(report_id):
        raise HTTPException(status_code=404, detail="Report not found")
    return {"status": "deleted"}


@app.post("/api/reports/{report_id}/publish")
async def publish_report_to_notion(report_id: str):
    report = report_manager.get_report(report_id)
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")
    if not notion_bridge.configured:
        raise HTTPException(status_code=400, detail="Notion not configured")
    url = await notion_bridge.publish_report(
        title=report.title,
        content=report.content,
        agent_name=report.agent_name,
        report_type=report.report_type,
        source=report.source,
    )
    if not url:
        raise HTTPException(status_code=500, detail="Failed to publish to Notion")
    report_manager.update_report(report_id, {"notion_page_url": url})
    return {"published": True, "notion_page_url": url}


# --- SCHEDULE ENDPOINTS ---
@app.get("/api/schedule")
async def list_schedule():
    return scheduler_manager.list_jobs()


@app.post("/api/schedule")
async def create_schedule(data: ScheduledJobCreate):
    job = scheduler_manager.add_job(data)
    return job.model_dump(mode="json")


@app.post("/api/schedule/simple")
async def create_schedule_simple(data: ScheduledJobCreateSimple):
    job = scheduler_manager.add_job_simple(data)
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


@app.get("/api/schedule/cron-preview")
async def cron_preview(frequency: str = "daily", time: str = "09:00", day_of_week: str = None, day_of_month: int = None):
    return scheduler_manager.get_cron_preview(frequency, time, day_of_week, day_of_month)


@app.get("/api/schedule/{job_id}/executions")
async def list_job_executions(job_id: str, limit: int = 20):
    return [e.model_dump(mode="json") for e in scheduler_manager.get_executions(job_id, limit)]


@app.get("/api/schedule/{job_id}/executions/{exec_id}")
async def get_job_execution(job_id: str, exec_id: str):
    execution = scheduler_manager.get_execution(job_id, exec_id)
    if not execution:
        raise HTTPException(status_code=404, detail="Execution not found")
    return execution.model_dump(mode="json")


@app.post("/api/schedule/{job_id}/executions/{exec_id}/feedback")
async def submit_execution_feedback(job_id: str, exec_id: str, data: dict):
    rating = data.get("rating")
    feedback = data.get("feedback", "")
    if not rating or not isinstance(rating, int) or rating < 1 or rating > 5:
        raise HTTPException(status_code=400, detail="Rating must be 1-5")
    execution = await scheduler_manager.update_execution_feedback(job_id, exec_id, rating, feedback)
    if not execution:
        raise HTTPException(status_code=404, detail="Execution not found")
    return execution.model_dump(mode="json")


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


# --- NOTION ENDPOINTS ---
@app.get("/api/notion/status")
async def notion_status():
    status = await notion_bridge.check_connection()
    status["last_sync"] = notion_bridge.last_sync
    status["cached_task_count"] = len(notion_bridge.get_cached_tasks())
    return status


@app.post("/api/notion/sync")
async def notion_sync():
    tasks = await notion_bridge.pull_new_tasks()
    return {"synced": len(tasks), "tasks": tasks}


@app.get("/api/notion/tasks")
async def notion_tasks():
    return notion_bridge.get_cached_tasks()


@app.post("/api/notion/tasks/{page_id}/run")
async def notion_run_task(page_id: str, data: dict):
    agent_id = data.get("agent_id")
    if not agent_id:
        raise HTTPException(status_code=400, detail="agent_id required")

    agent = agent_manager.get_agent(agent_id)
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")

    # Find task in cache for context
    task = next((t for t in notion_bridge.get_cached_tasks() if t["notion_page_id"] == page_id), None)
    prompt = ""
    if task:
        prompt = task["title"]
        if task.get("handoff_notes"):
            prompt += f"\n\nContext: {task['handoff_notes']}"
    else:
        prompt = data.get("prompt", "Execute this task")

    # Update Notion status to Working
    await notion_bridge.set_status(page_id, "Working")

    # Update Lab agent status
    agent_manager.update_status(agent_id, "working", f"Notion task: {prompt[:50]}")
    await ws_manager.broadcast("agent_status", {**agent.model_dump(mode="json"), "status": "working", "current_task": f"Notion task: {prompt[:50]}"})

    try:
        response = await agent_manager.chat_async(agent_id, prompt)

        # Check for error responses
        if response.startswith("Error:") or response.startswith("Configuration Error:"):
            await notion_bridge.set_status(page_id, "Blocked", blockers=response)
            agent_manager.update_status(agent_id, "error", response[:100])
            raise HTTPException(status_code=500, detail=response)

        # Push result back to Notion
        await notion_bridge.push_result(page_id, response, agent_name=agent.name)

        agent_manager.update_status(agent_id, "idle", None)
        await ws_manager.broadcast("agent_status", {**agent.model_dump(mode="json"), "status": "idle", "current_task": None})

        return {
            "status": "completed",
            "notion_page_id": page_id,
            "agent_name": agent.name,
            "result_preview": response[:300],
            "pushed_to_notion": True,
        }
    except HTTPException:
        raise
    except Exception as e:
        await notion_bridge.set_status(page_id, "Blocked", blockers=str(e))
        agent_manager.update_status(agent_id, "error", str(e)[:100])
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/notion/push-result")
async def notion_push_result(data: dict):
    page_id = data.get("page_id")
    result = data.get("result", "")
    agent_name = data.get("agent_name")
    status = data.get("status", "Done")
    if not page_id or not result:
        raise HTTPException(status_code=400, detail="page_id and result required")
    success = await notion_bridge.push_result(page_id, result, agent_name, status)
    return {"pushed": success}


@app.post("/api/notion/sync-knowledge")
async def notion_sync_knowledge(data: dict):
    page_id = data.get("page_id")
    if not page_id:
        raise HTTPException(status_code=400, detail="page_id required")
    result = await notion_bridge.sync_page_to_knowledge(page_id, knowledge_manager)
    if not result:
        raise HTTPException(status_code=404, detail="Page not found")
    return result


# --- CLAW3D REVERSE PROXY ---
# Claw3D is patched with basePath: '/claw3d' so all its routes are under /claw3d/*
# This proxy forwards /claw3d/* HTTP requests and /claw3d/api/gateway/ws WebSocket
import websockets as _ws_lib

CLAW3D_URL = os.getenv("CLAW3D_URL", "http://claw3d:3000")
CLAW3D_WS_URL = os.getenv("CLAW3D_WS_URL", "ws://claw3d:3000")
_claw3d_client = httpx.AsyncClient(base_url=CLAW3D_URL, timeout=30.0)

# Agent name→id cache for chat bridge
_agent_name_to_id = {}

async def _ensure_agent_map():
    """Build agent name→id lookup from The Lab's API."""
    if _agent_name_to_id:
        return
    try:
        async with httpx.AsyncClient() as c:
            r = await c.get("http://localhost:8000/api/agents", timeout=5.0)
            if r.status_code == 200:
                for a in r.json():
                    _agent_name_to_id[a["name"]] = a["id"]
    except Exception:
        pass


def _find_agent_in_key(session_key: str):
    """Find a known agent name inside a sessionKey of any format.
    Agent Bus uses keys like 'Scout:the-lab', Claw3D might send 'agent:Scout:the-lab:main', etc."""
    key_lower = session_key.lower()
    for name in _agent_name_to_id:
        if name.lower() in key_lower:
            return name
    # Fallback: try first segment
    return session_key.split(":")[0] if ":" in session_key else session_key


async def _handle_chat_send(ws: WebSocket, msg: dict):
    """Intercept chat.send → route to The Lab's /api/chat."""
    req_id = msg.get("id", "")
    params = msg.get("params", {})
    session_key = params.get("sessionKey", "")
    message = params.get("message", params.get("content", ""))

    print(f"[chat-bridge] chat.send params: {json.dumps(params)[:500]}")

    await _ensure_agent_map()
    agent_name = _find_agent_in_key(session_key)
    agent_id = _agent_name_to_id.get(agent_name)

    if not agent_id:
        await ws.send_text(json.dumps({"type": "res", "id": req_id, "ok": False,
            "error": {"code": "agent_not_found", "message": f"Agent '{agent_name}' not found"}}))
        return

    # Acknowledge the request immediately
    await ws.send_text(json.dumps({"type": "res", "id": req_id, "ok": True}))

    # Call The Lab's chat API
    try:
        async with httpx.AsyncClient() as c:
            r = await c.post("http://localhost:8000/api/chat",
                json={"agent_id": agent_id, "message": message}, timeout=120.0)
            if r.status_code == 200:
                data = r.json()
                response_text = data.get("response", "")
            else:
                response_text = f"Error: HTTP {r.status_code}"
    except Exception as e:
        response_text = f"Error: {e}"

    # Send response as OpenClaw runtime-chat event
    run_id = str(uuid.uuid4())
    await ws.send_text(json.dumps({
        "type": "event",
        "event": "runtime-chat",
        "payload": {
            "runId": run_id,
            "sessionKey": session_key,
            "seq": 1,
            "message": {"role": "assistant", "content": [{"type": "text", "text": response_text}]},
            "state": "final",
        }
    }))


async def _handle_chat_history(ws: WebSocket, msg: dict):
    """Intercept chat.history → route to The Lab's chat history API."""
    req_id = msg.get("id", "")
    params = msg.get("params", {})
    session_key = params.get("sessionKey", "")
    agent_name = _session_key_to_agent(session_key)

    await _ensure_agent_map()
    agent_id = _agent_name_to_id.get(agent_name)

    if not agent_id:
        await ws.send_text(json.dumps({"type": "res", "id": req_id, "ok": True, "payload": {"messages": []}}))
        return

    try:
        async with httpx.AsyncClient() as c:
            r = await c.get(f"http://localhost:8000/api/chat/{agent_id}/history", timeout=10.0)
            history = r.json() if r.status_code == 200 else []
    except Exception:
        history = []

    await ws.send_text(json.dumps({"type": "res", "id": req_id, "ok": True, "payload": {"messages": history}}))


@app.websocket("/claw3d/api/gateway/ws")
async def claw3d_ws_proxy(ws: WebSocket):
    """WebSocket proxy with chat interception: browser <-> Claw3D/Agent Bus."""
    await ws.accept()
    try:
        async with _ws_lib.connect(f"{CLAW3D_WS_URL}/api/gateway/ws") as upstream:
            async def browser_to_upstream():
                try:
                    while True:
                        data = await ws.receive_text()
                        try:
                            msg = json.loads(data)
                        except (json.JSONDecodeError, TypeError):
                            await upstream.send(data)
                            continue

                        method = msg.get("method", "") if msg.get("type") == "req" else ""

                        if method == "chat.send":
                            await _handle_chat_send(ws, msg)
                        else:
                            # Pass everything else to Agent Bus (including chat.history,
                            # skills.status — Agent Bus returns "Unknown method" which
                            # Claw3D handles gracefully. Our intercepted responses crashed it.)
                            await upstream.send(data)
                except Exception:
                    pass

            async def upstream_to_browser():
                try:
                    async for msg in upstream:
                        await ws.send_text(msg)
                except Exception:
                    pass

            await asyncio.gather(browser_to_upstream(), upstream_to_browser())
    except Exception as e:
        print(f"[claw3d-ws] Error: {e}")

@app.api_route("/claw3d/{path:path}", methods=["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS", "HEAD"])
async def claw3d_proxy(request: Request, path: str):
    """HTTP reverse proxy to Claw3D container (basePath: /claw3d)."""
    # Forward with /claw3d prefix — Claw3D expects it due to basePath config
    url = f"/claw3d/{path}"
    if request.url.query:
        url = f"{url}?{request.url.query}"
    try:
        resp = await _claw3d_client.request(
            method=request.method,
            url=url,
            headers={k: v for k, v in request.headers.items() if k.lower() not in ("host", "connection")},
            content=await request.body() if request.method in ("POST", "PUT", "PATCH") else None,
        )
        excluded = {"transfer-encoding", "connection", "content-encoding"}
        headers = {k: v for k, v in resp.headers.items() if k.lower() not in excluded}
        return StreamingResponse(
            content=iter([resp.content]),
            status_code=resp.status_code,
            headers=headers,
        )
    except httpx.ConnectError:
        raise HTTPException(status_code=502, detail="Claw3D service unavailable")


# --- CLAW3D ASSET PROXY ---
# Three.js useGLTF() requests /office-assets/*.glb with absolute paths (no basePath prefix).
# Without this route, the catch-all SPA handler returns index.html instead of the GLB binary.
@app.api_route("/office-assets/{path:path}", methods=["GET"])
async def claw3d_assets_proxy(request: Request, path: str):
    """Proxy 3D model/asset files to Claw3D container."""
    url = f"/claw3d/office-assets/{path}"
    try:
        resp = await _claw3d_client.request(method="GET", url=url)
        excluded = {"transfer-encoding", "connection", "content-encoding"}
        headers = {k: v for k, v in resp.headers.items() if k.lower() not in excluded}
        return StreamingResponse(
            content=iter([resp.content]),
            status_code=resp.status_code,
            headers=headers,
        )
    except httpx.ConnectError:
        raise HTTPException(status_code=502, detail="Claw3D service unavailable")


# --- CLAW3D API PROXY ---
# With basePath: '/claw3d', ALL Claw3D routes (pages, API, assets) are prefixed.
# The proxy must forward with the /claw3d/ prefix for Claw3D to find them.

@app.api_route("/api/studio", methods=["GET", "POST", "PUT"])
async def claw3d_studio_proxy(request: Request):
    """Proxy Claw3D studio settings API."""
    url = "/claw3d/api/studio"
    if request.url.query:
        url = f"{url}?{request.url.query}"
    try:
        resp = await _claw3d_client.request(
            method=request.method, url=url,
            headers={k: v for k, v in request.headers.items() if k.lower() not in ("host", "connection")},
            content=await request.body() if request.method in ("POST", "PUT") else None,
        )
        excluded = {"transfer-encoding", "connection", "content-encoding"}
        headers = {k: v for k, v in resp.headers.items() if k.lower() not in excluded}
        return StreamingResponse(content=iter([resp.content]), status_code=resp.status_code, headers=headers)
    except httpx.ConnectError:
        raise HTTPException(status_code=502, detail="Claw3D service unavailable")


@app.api_route("/api/office/{path:path}", methods=["GET", "POST", "PUT", "DELETE", "PATCH"])
async def claw3d_office_api_proxy(request: Request, path: str):
    """Proxy Claw3D office API (layout, preferences, standup)."""
    url = f"/claw3d/api/office/{path}"
    if request.url.query:
        url = f"{url}?{request.url.query}"
    try:
        resp = await _claw3d_client.request(
            method=request.method, url=url,
            headers={k: v for k, v in request.headers.items() if k.lower() not in ("host", "connection")},
            content=await request.body() if request.method in ("POST", "PUT", "PATCH") else None,
        )
        excluded = {"transfer-encoding", "connection", "content-encoding"}
        headers = {k: v for k, v in resp.headers.items() if k.lower() not in excluded}
        return StreamingResponse(content=iter([resp.content]), status_code=resp.status_code, headers=headers)
    except httpx.ConnectError:
        raise HTTPException(status_code=502, detail="Claw3D service unavailable")


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

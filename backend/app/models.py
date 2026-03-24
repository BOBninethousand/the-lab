from pydantic import BaseModel, Field
from datetime import datetime
from typing import Optional, List


class AgentCreate(BaseModel):
    name: str
    role: str
    goal: str
    backstory: str
    provider: str  # openai, anthropic, ollama
    model_name: str


class Agent(BaseModel):
    id: str
    name: str
    role: str
    goal: str
    backstory: str
    provider: str
    model_name: str
    status: str  # idle, working, error
    current_task: Optional[str] = None
    avatar_color: str
    created_at: datetime


class TaskCreate(BaseModel):
    title: str
    description: str
    agent_id: str


class Task(BaseModel):
    id: str
    title: str
    description: str
    agent_id: str
    status: str  # pending, running, completed, failed
    created_at: datetime
    completed_at: Optional[datetime] = None
    result: Optional[str] = None


class CrewCreate(BaseModel):
    name: str
    agent_ids: List[str]
    task_descriptions: List[str]
    process_type: str  # sequential, hierarchical


class Crew(BaseModel):
    id: str
    name: str
    agent_ids: List[str]
    task_descriptions: List[str]
    process_type: str
    status: str  # pending, running, completed, failed
    created_at: datetime
    results: Optional[str] = None


class MemoryCreate(BaseModel):
    content: str
    tags: List[str] = []
    source: str


class MemoryEntry(BaseModel):
    id: str
    date: str
    content: str
    tags: List[str]
    source: str


class JournalCreate(BaseModel):
    title: str
    content: str
    highlights: Optional[str] = None


class JournalEntry(BaseModel):
    id: str
    date: str
    title: str
    content: str
    highlights: Optional[str] = None


class DocumentCreate(BaseModel):
    title: str
    content: str
    doc_type: str  # brief, report, draft, code, other
    agent_id: Optional[str] = None


class Document(BaseModel):
    id: str
    title: str
    content: str
    doc_type: str
    created_at: datetime
    agent_id: Optional[str] = None


class ScheduledJobCreate(BaseModel):
    name: str
    description: str
    cron_expression: str
    prompt: str
    agent_id: str


class ScheduledJobCreateSimple(BaseModel):
    name: str
    description: str
    frequency: str = "daily"  # daily, weekdays, weekly, monthly, custom
    time: str = "09:00"  # HH:MM
    day_of_week: Optional[str] = None  # mon, tue, etc.
    day_of_month: Optional[int] = None
    cron_expression: Optional[str] = None  # only for custom frequency
    prompt: str
    agent_id: str


class ScheduledJob(BaseModel):
    id: str
    name: str
    description: str
    cron_expression: str
    prompt: str
    agent_id: str
    enabled: bool
    last_run: Optional[datetime] = None
    next_run: Optional[datetime] = None


class JobExecution(BaseModel):
    id: str
    job_id: str
    job_name: str
    agent_id: str
    agent_name: str
    executed_at: datetime
    status: str  # success, failed
    result_preview: str
    result_document_id: Optional[str] = None
    error: Optional[str] = None
    rating: Optional[int] = None
    feedback: Optional[str] = None


class ChatMessage(BaseModel):
    id: str
    role: str  # user, assistant
    content: str
    agent_id: str
    timestamp: datetime


class ChatRequest(BaseModel):
    agent_id: str
    message: str


class WebSocketEvent(BaseModel):
    type: str
    data: dict


# --- Memory System Models ---

class KnowledgeCreate(BaseModel):
    title: str
    content: str
    tags: List[str] = []
    category: str = "fact"  # rule, fact, reference, preference
    notion_page_id: Optional[str] = None


class KnowledgeEntry(BaseModel):
    id: str
    title: str
    content: str
    tags: List[str]
    category: str
    source: str = "manual"
    notion_page_id: Optional[str] = None
    embedding: Optional[List[float]] = None
    created_at: datetime
    updated_at: datetime


class AgentMemoryCreate(BaseModel):
    content: str
    memory_type: str = "insight"  # insight, learning, preference, fact
    tags: List[str] = []


class AgentMemoryEntry(BaseModel):
    id: str
    agent_id: str
    content: str
    memory_type: str
    tags: List[str] = []
    embedding: Optional[List[float]] = None
    source_chat_id: Optional[str] = None
    created_at: datetime


class CorrectionCreate(BaseModel):
    agent_id: str
    original_response: str
    correction: str
    tags: List[str] = []


class CorrectionEntry(BaseModel):
    id: str
    agent_id: str
    original_response: str
    correction: str
    rule_created: bool = False
    occurrence_count: int = 1
    embedding: Optional[List[float]] = None
    tags: List[str] = []
    created_at: datetime


class MemoryStats(BaseModel):
    knowledge_count: int
    agent_memory_count: int
    correction_count: int
    rules_count: int
    agents_with_memory: List[str]


# --- Report Models ---

class ReportCreate(BaseModel):
    title: str
    content: str
    report_type: str  # briefing, content, tech_report, outreach, weekly_review, content_calendar
    agent_id: str
    agent_name: str  # Scout, Quill, Forge, Radar
    source: str = "scheduled"  # scheduled, manual, n8n
    starred: bool = False


class Report(BaseModel):
    id: str
    title: str
    content: str
    report_type: str
    agent_id: str
    agent_name: str
    source: str
    starred: bool = False
    read: bool = False
    created_at: datetime

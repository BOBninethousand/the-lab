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

# The Lab - AI Agent Operations Hub

A production-ready FastAPI backend for managing multiple AI agents that do research, create content, find leads, and build features for HealthDataLab.com, Altituding.com, and IrisMapper.com.

## Features

- **Multi-Agent Management**: Create, configure, and manage AI agents with different LLM providers (OpenAI, Anthropic, Ollama)
- **Agent Chat**: Real-time chat with agents backed by LLMs
- **Task Management**: Create and run tasks assigned to agents
- **Crew Operations**: Orchestrate multiple agents working together on complex tasks
- **Memory System**: Store and retrieve memories with tags and search
- **Journal Tracking**: Daily journal entries with highlights
- **Document Management**: Create and manage generated documents (briefs, reports, drafts, code)
- **Scheduled Jobs**: Schedule recurring agent tasks using cron expressions
- **Calendar View**: See all scheduled jobs in a calendar view
- **WebSocket Updates**: Real-time status updates via WebSocket

## Default Agents

The system comes with 4 pre-configured agents:

1. **Scout** - Senior Market Research Analyst
   - Provider: OpenAI (gpt-4o)
   - Goal: Research competitors, market trends, potential customers

2. **Quill** - Content Strategist & Writer
   - Provider: Anthropic (claude-sonnet-4-20250514)
   - Goal: Create compelling content that drives traffic and conversions

3. **Forge** - Senior Full-Stack Developer
   - Provider: Anthropic (claude-sonnet-4-20250514)
   - Goal: Build features, fix bugs, ship code

4. **Radar** - Business Development Representative
   - Provider: OpenAI (gpt-4o)
   - Goal: Find leads, draft outreach, identify partnerships

## Setup

### 1. Install Dependencies

```bash
pip install -r requirements.txt
```

### 2. Configure Environment

```bash
cp .env.example .env
```

Add your API keys to `.env`:
- `OPENAI_API_KEY`: Your OpenAI API key
- `ANTHROPIC_API_KEY`: Your Anthropic API key
- `OLLAMA_BASE_URL`: Local Ollama server URL (if using)
- `DISCORD_BOT_TOKEN`: Discord bot token (optional)
- `DISCORD_CHANNEL_*`: Discord channel IDs for notifications (optional)

### 3. Run the Server

```bash
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

The API will be available at http://localhost:8000
API documentation at http://localhost:8000/docs

## API Endpoints

### Agents
- `GET /api/agents` - List all agents
- `POST /api/agents` - Create new agent
- `GET /api/agents/{agent_id}` - Get agent details
- `PATCH /api/agents/{agent_id}` - Update agent status
- `DELETE /api/agents/{agent_id}` - Delete agent

### Chat
- `POST /api/chat` - Send message to agent
- `GET /api/chat/{agent_id}/history` - Get chat history

### Tasks
- `GET /api/tasks` - List all tasks
- `POST /api/tasks` - Create task
- `GET /api/tasks/{task_id}` - Get task details
- `POST /api/tasks/{task_id}/run` - Run task

### Crews
- `GET /api/crews` - List all crews
- `POST /api/crews` - Create crew (automatically starts execution)
- `GET /api/crews/{crew_id}` - Get crew details

### Memory
- `GET /api/memory` - List memories (with optional filters)
- `POST /api/memory` - Add memory
- `GET /api/memory/journals` - List journals
- `GET /api/memory/journals/{date}` - Get journal for date
- `POST /api/memory/journals` - Create journal entry

### Documents
- `GET /api/documents` - List documents
- `POST /api/documents` - Create document
- `GET /api/documents/{doc_id}` - Get document

### Schedule
- `GET /api/schedule` - List scheduled jobs
- `POST /api/schedule` - Create scheduled job
- `PATCH /api/schedule/{job_id}` - Toggle job on/off
- `DELETE /api/schedule/{job_id}` - Delete scheduled job
- `GET /api/calendar` - Get calendar view of scheduled jobs
- `POST /api/schedule/{job_id}/run` - Manually run job

### Health
- `GET /api/health` - Health check

### WebSocket
- `WS /ws` - Real-time updates

## Data Storage

All data is stored as JSON files in the `data/` directory:

```
data/
├── agents.json          # Agent configurations
├── tasks.json           # Task definitions
├── crews.json           # Crew configurations
├── scheduled_jobs.json  # Scheduled job configs
├── memories/            # Individual memory files
├── journals/            # Daily journal files
├── documents/           # Generated documents
├── chats/               # Chat histories by agent
└── crew_logs/           # Crew execution logs
```

## Example: Create and Chat with Agent

```bash
# Create a custom agent
curl -X POST http://localhost:8000/api/agents \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Analyst",
    "role": "Data Analyst",
    "goal": "Analyze data",
    "backstory": "Expert analyst",
    "provider": "openai",
    "model_name": "gpt-4o"
  }'

# Chat with the agent
curl -X POST http://localhost:8000/api/chat \
  -H "Content-Type: application/json" \
  -d '{
    "agent_id": "agent-uuid-here",
    "message": "What are the latest market trends?"
  }'
```

## Example: Schedule a Job

```bash
curl -X POST http://localhost:8000/api/schedule \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Daily Market Brief",
    "description": "Generate daily market analysis",
    "cron_expression": "0 9 * * *",
    "prompt": "Summarize today'\''s top market news and trends",
    "agent_id": "scout-agent-id"
  }'
```

The job will run every day at 9:00 AM and save results as a document.

## Example: Create a Crew

```bash
curl -X POST http://localhost:8000/api/crews \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Content Sprint",
    "agent_ids": ["quill-agent-id", "forge-agent-id"],
    "task_descriptions": [
      "Write a blog post about AI trends",
      "Create code examples for the blog"
    ],
    "process_type": "sequential"
  }'
```

## Notes

- All timestamps are in ISO format
- UUIDs are used for all entity IDs
- WebSocket broadcasts real-time updates for all major events
- Graceful error handling: missing API keys return helpful error messages instead of crashing
- JSON files are automatically created if they don't exist
- Chat histories are per-agent

# The Lab

AI agent operations hub for HealthDataLab, Altituding, and IrisMapper. Manage, monitor, and interact with multiple AI agents from a single dashboard.

## Quick Start

```bash
git clone <this-repo>
cd the-lab
cp backend/.env.example backend/.env
# Fill in your API keys in backend/.env
chmod +x start.sh
./start.sh
```

Dashboard: `http://localhost:5173`
API docs: `http://localhost:8000/docs`

## Stack

- **Backend**: Python, FastAPI, CrewAI, LangChain, APScheduler
- **Frontend**: React, Vite, Tailwind CSS
- **Providers**: OpenAI, Anthropic, Ollama (local models)

## Default Agents

| Name | Role | Provider |
|------|------|----------|
| Scout | Market Research Analyst | OpenAI |
| Quill | Content Strategist | Anthropic |
| Forge | Full-Stack Developer | Anthropic |
| Radar | Business Development | OpenAI |

## Deploy Online

```bash
# Docker
chmod +x deploy.sh && ./deploy.sh

# Cloudflare Tunnel (instant public URL)
cloudflared tunnel --url http://localhost:8000
```

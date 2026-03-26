"""
Bridge: The Lab WebSocket -> Agent Bus HTTP Events

Listens to The Lab's WebSocket for agent events and translates them
to Agent Bus HTTP POST format so Claw3D can visualise agents.
"""

import asyncio
import json
import os
import httpx
import websockets

LAB_WS_URL = os.getenv("LAB_WS_URL", "ws://the-lab:8000/ws")
LAB_API_URL = os.getenv("LAB_API_URL", "http://the-lab:8000")
AGENT_BUS_URL = os.getenv("AGENT_BUS_URL", "http://agent-bus:4000/events")
HEARTBEAT_INTERVAL = int(os.getenv("HEARTBEAT_INTERVAL", "30"))

known_agents = {}


async def post_event(client, agent, event, **kwargs):
    payload = {"agent": agent, "event": event, "project": "the-lab"}
    payload.update(kwargs)
    try:
        await client.post(AGENT_BUS_URL, json=payload, timeout=5.0)
        print(f"  -> {event}: {agent}")
    except Exception as e:
        print(f"  !! Failed to post {event} for {agent}: {e}")


async def handle_lab_event(client, msg):
    try:
        data = json.loads(msg)
    except json.JSONDecodeError:
        return

    event_type = data.get("type", "")
    event_data = data.get("data", {})

    if event_type == "agent_status":
        name = event_data.get("name", "unknown")
        status = event_data.get("status", "idle")
        task = event_data.get("current_task", "")
        known_agents[name] = status

        if status == "working":
            await post_event(client, name, "session_start", message=task or "Working")
        elif status == "error":
            await post_event(client, name, "task_complete", message="Error state")
        else:
            await post_event(client, name, "task_complete", message="Idle")

    elif event_type == "agent_created":
        name = event_data.get("name", "unknown")
        known_agents[name] = "idle"
        await post_event(client, name, "session_start", message="Agent created")

    elif event_type == "task_completed":
        name = event_data.get("agent_name", "unknown")
        result = event_data.get("result", "")[:200]
        await post_event(client, name, "task_complete", message=result)

    elif event_type == "crew_status":
        name = event_data.get("name", "crew")
        status = event_data.get("status", "")
        if status == "running":
            await post_event(client, name, "session_start", message="Crew task running")
        elif status in ("completed", "error"):
            await post_event(client, name, "task_complete", message=f"Crew {status}")

    elif event_type == "crew_task_progress":
        name = event_data.get("agent_name", "unknown")
        await post_event(client, name, "tool_use", tool="crew_task", message="Crew subtask")

    elif event_type == "job_completed":
        name = event_data.get("agent_name", "unknown")
        result = event_data.get("result", "")[:200]
        await post_event(client, name, "task_complete", message=f"Job: {result}")


async def register_existing_agents(client):
    """Fetch all agents from The Lab REST API and register them in Agent Bus.
    Agent Bus only knows about agents that send session_start/tool_use/task_complete.
    Without this, Claw3D sees 0 agents on startup."""
    print("Registering existing agents...")
    try:
        resp = await client.get(f"{LAB_API_URL}/api/agents", timeout=10.0)
        if resp.status_code != 200:
            print(f"  !! Failed to fetch agents: HTTP {resp.status_code}")
            return

        agents = resp.json()
        if not isinstance(agents, list):
            agents = agents.get("agents", [])

        for agent in agents:
            name = agent.get("name", "unknown")
            status = agent.get("status", "idle")
            task = agent.get("current_task", "")
            role = agent.get("role", "")
            known_agents[name] = status

            # session_start registers the agent in Agent Bus (heartbeat does NOT)
            msg = task if status == "working" else role or f"{name} is online"
            await post_event(client, name, "session_start", message=msg)

        print(f"Registered {len(agents)} agents: {', '.join(known_agents.keys())}")
    except Exception as e:
        print(f"  !! Failed to register agents: {e}")


async def heartbeat_loop(client):
    while True:
        await asyncio.sleep(HEARTBEAT_INTERVAL)
        for name in list(known_agents.keys()):
            await post_event(client, name, "heartbeat")


async def main():
    print(f"Bridge starting: {LAB_WS_URL} -> {AGENT_BUS_URL}")

    async with httpx.AsyncClient() as client:
        heartbeat_task = asyncio.create_task(heartbeat_loop(client))

        while True:
            try:
                print(f"Connecting to {LAB_WS_URL}...")
                async with websockets.connect(LAB_WS_URL) as ws:
                    print("Connected to The Lab WebSocket")
                    await register_existing_agents(client)
                    async for msg in ws:
                        await handle_lab_event(client, msg)
            except (websockets.ConnectionClosed, ConnectionRefusedError, OSError) as e:
                print(f"Connection lost ({e}), reconnecting in 5s...")
                await asyncio.sleep(5)
            except Exception as e:
                print(f"Unexpected error: {e}, reconnecting in 10s...")
                await asyncio.sleep(10)


if __name__ == "__main__":
    asyncio.run(main())

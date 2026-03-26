import { NextRequest, NextResponse } from "next/server";

const LAB_URL = process.env.LAB_CHAT_URL || "http://the-lab:8000";

// Simple TTL cache for agent list (avoid fetching on every message)
let cachedAgents: any[] | null = null;
let cacheTime = 0;
const CACHE_TTL = 60_000; // 60 seconds

async function getAgents(): Promise<any[]> {
  if (cachedAgents && Date.now() - cacheTime < CACHE_TTL) return cachedAgents;
  const resp = await fetch(`${LAB_URL}/api/agents`);
  const data = await resp.json();
  cachedAgents = Array.isArray(data) ? data : [];
  cacheTime = Date.now();
  return cachedAgents;
}

// GET /claw3d/api/lab-chat?agentName=Scout — returns agent info for welcome message
export async function GET(req: NextRequest) {
  const agentName = req.nextUrl.searchParams.get("agentName");
  if (!agentName) {
    return NextResponse.json({ error: "agentName required" }, { status: 400 });
  }
  try {
    const agents = await getAgents();
    const agent = agents.find((a: any) => a.name === agentName);
    if (!agent) {
      return NextResponse.json({ error: "Agent not found" }, { status: 404 });
    }
    return NextResponse.json({
      name: agent.name,
      role: agent.role || "",
      goal: agent.goal || "",
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const { agentName, message } = await req.json();

  try {
    const agents = await getAgents();
    const agent = agents.find((a: any) => a.name === agentName);

    if (!agent) {
      return NextResponse.json({ error: `Agent '${agentName}' not found` }, { status: 404 });
    }

    const chatResp = await fetch(`${LAB_URL}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ agent_id: agent.id, message }),
    });

    if (!chatResp.ok) {
      const errData = await chatResp.json().catch(() => ({}));
      return NextResponse.json(
        { error: errData.detail || `Chat failed (${chatResp.status})` },
        { status: chatResp.status }
      );
    }

    const data = await chatResp.json();
    return NextResponse.json({ response: data.response || "", agentName: agent.name });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

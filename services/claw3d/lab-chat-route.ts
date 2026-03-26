import { NextRequest, NextResponse } from "next/server";

const LAB_URL = process.env.LAB_CHAT_URL || "http://the-lab:8000";

// GET /claw3d/api/lab-chat?agentName=Scout — returns agent info for welcome message
export async function GET(req: NextRequest) {
  const agentName = req.nextUrl.searchParams.get("agentName");
  if (!agentName) {
    return NextResponse.json({ error: "agentName required" }, { status: 400 });
  }
  try {
    const resp = await fetch(`${LAB_URL}/api/agents`);
    const agents = await resp.json();
    const agent = Array.isArray(agents)
      ? agents.find((a: any) => a.name === agentName)
      : null;
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
    // Find agent by name
    const agentsResp = await fetch(`${LAB_URL}/api/agents`);
    const agents = await agentsResp.json();
    const agent = Array.isArray(agents)
      ? agents.find((a: any) => a.name === agentName)
      : null;

    if (!agent) {
      return NextResponse.json({ error: `Agent '${agentName}' not found` }, { status: 404 });
    }

    // Send chat message
    const chatResp = await fetch(`${LAB_URL}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ agent_id: agent.id, message }),
    });

    const data = await chatResp.json();
    return NextResponse.json({ response: data.response || "", agentName: agent.name });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

"use client";
/**
 * Lab Chat Panel — Drop-in replacement for Claw3D's AgentChatPanel.
 * Uses HTTP to The Lab's /api/chat instead of OpenClaw WebSocket protocol.
 * Same props interface as the original so the parent component doesn't break.
 */
import React, { memo, useCallback, useRef, useState, useEffect } from "react";
import type { AgentState as AgentRecord } from "@/features/agents/state/store";
import type { ExecApprovalDecision, PendingExecApproval } from "@/features/agents/approvals/types";
import type { GatewayModelChoice } from "@/lib/gateway/models";
import type { VoiceSendPayload } from "@/hooks/useVoiceRecorder";
import { AgentAvatar } from "./AgentAvatar";

type ChatMessage = { role: "user" | "assistant"; content: string; ts: number };

type AgentChatPanelProps = {
  agent: AgentRecord;
  isSelected?: boolean;
  canSend?: boolean;
  models?: GatewayModelChoice[];
  stopBusy?: boolean;
  stopDisabledReason?: string | null;
  onLoadMoreHistory?: () => void;
  onOpenSettings?: () => void;
  onRename?: (name: string) => Promise<boolean>;
  onNewSession?: () => Promise<void> | void;
  onModelChange?: (value: string | null) => void;
  onThinkingChange?: (value: string | null) => void;
  onToolCallingToggle?: (enabled: boolean) => void;
  onThinkingTracesToggle?: (enabled: boolean) => void;
  onDraftChange?: (value: string) => void;
  onSend?: (message: string) => void;
  onRemoveQueuedMessage?: (index: number) => void;
  onStopRun?: () => void;
  onAvatarShuffle?: () => void;
  pendingExecApprovals?: PendingExecApproval[];
  onResolveExecApproval?: (id: string, decision: ExecApprovalDecision) => void;
  onVoiceSend?: (payload: VoiceSendPayload) => Promise<void>;
};

function AgentChatPanelInner(props: AgentChatPanelProps) {
  const { agent, onNewSession } = props;
  // Store messages PER AGENT so switching agents shows the right history
  const [messagesByAgent, setMessagesByAgent] = useState<Record<string, ChatMessage[]>>({});
  const [draft, setDraft] = useState<string>("");
  const [sending, setSending] = useState<boolean>(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const messages = messagesByAgent[agent.name] || [];

  const addMessage = useCallback((agentName: string, msg: ChatMessage) => {
    setMessagesByAgent((prev: Record<string, ChatMessage[]>) => ({
      ...prev,
      [agentName]: [...(prev[agentName] || []), msg],
    }));
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = useCallback(async () => {
    const msg = draft.trim();
    if (!msg || sending) return;
    const currentAgent = agent.name;

    setDraft("");
    setSending(true);
    addMessage(currentAgent, { role: "user" as const, content: msg, ts: Date.now() });

    try {
      const resp = await fetch("/claw3d/api/lab-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentName: currentAgent, message: msg }),
      });
      const data = await resp.json();
      if (data.response) {
        addMessage(currentAgent, { role: "assistant" as const, content: data.response, ts: Date.now() });
      } else if (data.error) {
        addMessage(currentAgent, { role: "assistant" as const, content: `Error: ${data.error}`, ts: Date.now() });
      }
    } catch (err: unknown) {
      const msg2 = err instanceof Error ? err.message : String(err);
      addMessage(currentAgent, { role: "assistant" as const, content: `Error: ${msg2}`, ts: Date.now() });
    } finally {
      setSending(false);
    }
  }, [draft, sending, agent.name]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleNewSession = useCallback(() => {
    if (onNewSession) void onNewSession();
    setMessagesByAgent((prev: Record<string, ChatMessage[]>) => ({ ...prev, [agent.name]: [] }));
  }, [onNewSession, agent.name]);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "#0c0c14" }}>
      {/* Header */}
      <div style={{ padding: "12px 16px", borderBottom: "1px solid rgba(255,255,255,0.08)", display: "flex", alignItems: "center", gap: 12 }}>
        <AgentAvatar seed={agent.name} name={agent.name} size={36} />
        <div>
          <div style={{ fontWeight: 600, fontSize: 14, color: "#fff" }}>{agent.name}</div>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>
            {sending ? "Thinking..." : "Online"}
          </div>
        </div>
        <button
          onClick={handleNewSession}
          style={{ marginLeft: "auto", fontSize: 11, padding: "4px 10px", borderRadius: 6, border: "1px solid rgba(255,255,255,0.15)", background: "transparent", color: "rgba(255,255,255,0.5)", cursor: "pointer" }}
        >
          New session
        </button>
      </div>

      {/* Messages */}
      <div style={{ flex: 1, overflowY: "auto", padding: "12px 16px", display: "flex", flexDirection: "column", gap: 8 }}>
        {messages.length === 0 && (
          <div style={{ textAlign: "center", color: "rgba(255,255,255,0.2)", fontSize: 12, marginTop: 40 }}>
            Send a message to {agent.name}
          </div>
        )}
        {messages.map((m: ChatMessage, i: number) => (
          <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: m.role === "user" ? "flex-end" : "flex-start" }}>
            <div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", marginBottom: 2 }}>
              {m.role === "user" ? "You" : agent.name}
            </div>
            <div style={{
              maxWidth: "85%",
              padding: "8px 12px",
              borderRadius: 10,
              fontSize: 13,
              lineHeight: 1.5,
              whiteSpace: "pre-wrap" as const,
              wordBreak: "break-word" as const,
              background: m.role === "user" ? "rgba(59,130,246,0.15)" : "rgba(255,255,255,0.06)",
              color: m.role === "user" ? "rgba(147,197,253,0.95)" : "rgba(255,255,255,0.85)",
              border: `1px solid ${m.role === "user" ? "rgba(59,130,246,0.2)" : "rgba(255,255,255,0.06)"}`,
            }}>
              {m.content}
            </div>
          </div>
        ))}
        {sending && (
          <div style={{ display: "flex", alignItems: "center", gap: 6, color: "rgba(255,255,255,0.3)", fontSize: 12 }}>
            <div style={{ width: 6, height: 6, borderRadius: "50%", background: "rgba(16,185,129,0.6)" }} />
            {agent.name} is thinking...
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div style={{ padding: "8px 12px", borderTop: "1px solid rgba(255,255,255,0.08)", display: "flex", gap: 8, alignItems: "flex-end" }}>
        <textarea
          value={draft}
          onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setDraft(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={`Message ${agent.name}...`}
          rows={1}
          style={{
            flex: 1, resize: "none" as const, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)",
            borderRadius: 8, padding: "8px 12px", color: "#fff", fontSize: 13, outline: "none",
            fontFamily: "inherit",
          }}
        />
        <button
          onClick={handleSend}
          disabled={sending || !draft.trim()}
          style={{
            padding: "8px 16px", borderRadius: 8, border: "none", cursor: sending || !draft.trim() ? "default" : "pointer",
            background: sending || !draft.trim() ? "rgba(255,255,255,0.05)" : "rgba(59,130,246,0.3)",
            color: sending || !draft.trim() ? "rgba(255,255,255,0.2)" : "rgba(147,197,253,0.9)",
            fontSize: 13, fontWeight: 500, display: "flex", alignItems: "center", gap: 4,
          }}
        >
          Send
        </button>
      </div>
    </div>
  );
}

export const AgentChatPanel = memo(AgentChatPanelInner);
export default AgentChatPanel;

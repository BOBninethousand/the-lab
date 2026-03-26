"use client";
/**
 * Lab Chat Panel — Drop-in replacement for Claw3D's AgentChatPanel.
 * Uses HTTP to The Lab's /api/chat instead of OpenClaw WebSocket protocol.
 * Supports voice input (OpenAI Whisper) and voice output (OpenAI TTS).
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

// Map agent names to OpenAI TTS voices
const AGENT_VOICES: Record<string, string> = {
  Scout: "nova",
  Quill: "alloy",
  Forge: "onyx",
  Radar: "shimmer",
};

function AgentChatPanelInner(props: AgentChatPanelProps) {
  const { agent, onNewSession } = props;
  const [messagesByAgent, setMessagesByAgent] = useState<Record<string, ChatMessage[]>>({});
  const [draft, setDraft] = useState<string>("");
  const [sending, setSending] = useState<boolean>(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Voice state
  const [voiceState, setVoiceState] = useState<"idle" | "recording" | "transcribing" | "speaking">("idle");
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const audioContextRef = useRef<AudioContext | null>(null);
  const currentAudioRef = useRef<HTMLAudioElement | null>(null);
  const voiceInitiatedRef = useRef<boolean>(false);

  const messages = messagesByAgent[agent.name] || [];

  const addMessage = useCallback((agentName: string, msg: ChatMessage) => {
    setMessagesByAgent((prev: Record<string, ChatMessage[]>) => ({
      ...prev,
      [agentName]: [...(prev[agentName] || []), msg],
    }));
  }, []);

  // Auto-greeting: fetch agent role/goal and show welcome message on first open
  useEffect(() => {
    if (messagesByAgent[agent.name]) return;
    let cancelled = false;
    fetch(`/claw3d/api/lab-chat?agentName=${encodeURIComponent(agent.name)}`)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled || messagesByAgent[agent.name]) return;
        const greeting = data.role
          ? `Hi, I'm ${data.name} — ${data.role}.${data.goal ? `\n\n${data.goal}` : ""}\n\nHow can I help?`
          : `Hi, I'm ${data.name}. How can I help?`;
        addMessage(agent.name, { role: "assistant" as const, content: greeting, ts: Date.now() });
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [agent.name]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Cleanup audio on unmount
  useEffect(() => {
    return () => {
      if (currentAudioRef.current) {
        currentAudioRef.current.pause();
        currentAudioRef.current = null;
      }
    };
  }, []);

  // --- Text-to-speech playback ---
  const speakText = useCallback(async (text: string) => {
    const voice = AGENT_VOICES[agent.name] || "alloy";
    setVoiceState("speaking");
    try {
      const resp = await fetch("/api/voice/speak", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: text.slice(0, 4096), voice }),
        signal: AbortSignal.timeout(30000),
      });
      if (!resp.ok) {
        setVoiceState("idle");
        return;
      }
      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      currentAudioRef.current = audio;
      audio.onended = () => {
        URL.revokeObjectURL(url);
        currentAudioRef.current = null;
        setVoiceState("idle");
      };
      audio.onerror = () => {
        URL.revokeObjectURL(url);
        currentAudioRef.current = null;
        setVoiceState("idle");
      };
      await audio.play();
    } catch {
      setVoiceState("idle");
    }
  }, [agent.name]);

  // Stop audio playback
  const stopAudio = useCallback(() => {
    if (currentAudioRef.current) {
      currentAudioRef.current.pause();
      currentAudioRef.current = null;
    }
    setVoiceState("idle");
  }, []);

  // --- Send message (text or transcribed voice) ---
  const sendMessage = useCallback(async (msg: string, fromVoice: boolean) => {
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
        signal: AbortSignal.timeout(30000),
      });
      const data = await resp.json();
      if (data.response) {
        addMessage(currentAgent, { role: "assistant" as const, content: data.response, ts: Date.now() });
        // Auto-play TTS if the message was voice-initiated
        if (fromVoice) {
          speakText(data.response);
        }
      } else if (data.error) {
        addMessage(currentAgent, { role: "assistant" as const, content: `Error: ${data.error}`, ts: Date.now() });
      }
    } catch (err: unknown) {
      const msg2 = err instanceof Error ? err.message : String(err);
      addMessage(currentAgent, { role: "assistant" as const, content: `Error: ${msg2}`, ts: Date.now() });
    } finally {
      setSending(false);
    }
  }, [draft, sending, agent.name, speakText]);

  const handleSend = useCallback(() => {
    sendMessage(draft.trim(), false);
  }, [draft, sendMessage]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // --- Voice recording ---
  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : MediaRecorder.isTypeSupported("audio/webm")
          ? "audio/webm"
          : "audio/mp4";
      const recorder = new MediaRecorder(stream, { mimeType });
      audioChunksRef.current = [];

      recorder.ondataavailable = (e: BlobEvent) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(audioChunksRef.current, { type: mimeType });
        if (blob.size === 0) {
          setVoiceState("idle");
          return;
        }

        // Transcribe
        setVoiceState("transcribing");
        try {
          const form = new FormData();
          const ext = mimeType.includes("webm") ? "webm" : "mp4";
          form.append("file", blob, `voice-note.${ext}`);
          const resp = await fetch("/api/voice/transcribe", {
            method: "POST",
            body: form,
            signal: AbortSignal.timeout(15000),
          });
          const data = await resp.json();
          if (data.transcript && data.transcript.trim()) {
            voiceInitiatedRef.current = true;
            setVoiceState("idle");
            sendMessage(data.transcript.trim(), true);
          } else {
            setVoiceState("idle");
          }
        } catch {
          setVoiceState("idle");
        }
      };

      mediaRecorderRef.current = recorder;
      recorder.start();
      setVoiceState("recording");
    } catch {
      setVoiceState("idle");
    }
  }, [sendMessage]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
      mediaRecorderRef.current.stop();
    }
  }, []);

  const handleVoiceToggle = useCallback(() => {
    if (voiceState === "recording") {
      stopRecording();
    } else if (voiceState === "speaking") {
      stopAudio();
    } else if (voiceState === "idle" && !sending) {
      startRecording();
    }
  }, [voiceState, sending, startRecording, stopRecording, stopAudio]);

  const handleNewSession = useCallback(() => {
    if (onNewSession) void onNewSession();
    stopAudio();
    setMessagesByAgent((prev: Record<string, ChatMessage[]>) => ({ ...prev, [agent.name]: [] }));
  }, [onNewSession, agent.name, stopAudio]);

  // Voice button appearance
  const voiceSupported = typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia;

  const micIcon = voiceState === "recording"
    ? "⏹" : voiceState === "transcribing"
      ? "..." : voiceState === "speaking"
        ? "🔊" : "🎤";

  const micLabel = voiceState === "recording"
    ? "Stop" : voiceState === "transcribing"
      ? "Transcribing" : voiceState === "speaking"
        ? "Playing" : "Voice";

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "#0c0c14" }}>
      {/* Header */}
      <div style={{ padding: "12px 16px", borderBottom: "1px solid rgba(255,255,255,0.08)", display: "flex", alignItems: "center", gap: 12 }}>
        <AgentAvatar seed={agent.name} name={agent.name} size={36} />
        <div>
          <div style={{ fontWeight: 600, fontSize: 14, color: "#fff" }}>{agent.name}</div>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>
            {sending ? "Thinking..." : voiceState === "recording" ? "Listening..." : voiceState === "speaking" ? "Speaking..." : "Online"}
          </div>
        </div>
        <button
          onClick={handleNewSession}
          style={{ marginLeft: "auto", fontSize: 11, padding: "4px 10px", borderRadius: 6, border: "1px solid rgba(255,255,255,0.15)", background: "transparent", color: "rgba(255,255,255,0.5)", cursor: "pointer" }}
        >
          New session
        </button>
      </div>

      {/* Voice status bar */}
      {voiceState !== "idle" && (
        <div style={{
          padding: "6px 16px",
          fontSize: 11,
          display: "flex",
          alignItems: "center",
          gap: 8,
          background: voiceState === "recording" ? "rgba(239,68,68,0.1)" : "rgba(59,130,246,0.1)",
          borderBottom: "1px solid rgba(255,255,255,0.05)",
          color: voiceState === "recording" ? "rgba(252,165,165,0.9)" : "rgba(147,197,253,0.9)",
        }}>
          {voiceState === "recording" && (
            <>
              <span style={{
                width: 8, height: 8, borderRadius: "50%",
                background: "#ef4444",
                animation: "pulse-dot 1s ease-in-out infinite",
              }} />
              Recording — tap stop to send
            </>
          )}
          {voiceState === "transcribing" && "Transcribing your voice note..."}
          {voiceState === "speaking" && (
            <>
              <span style={{ fontSize: 14 }}>🔊</span>
              {agent.name} is speaking — tap to stop
            </>
          )}
        </div>
      )}

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
        {/* Voice button */}
        {voiceSupported && (
          <button
            onClick={handleVoiceToggle}
            disabled={voiceState === "transcribing" || sending}
            title={micLabel}
            style={{
              padding: "8px 12px", borderRadius: 8, border: "none", fontSize: 14, lineHeight: 1,
              cursor: voiceState === "transcribing" || sending ? "default" : "pointer",
              background: voiceState === "recording"
                ? "rgba(239,68,68,0.3)"
                : voiceState === "speaking"
                  ? "rgba(16,185,129,0.3)"
                  : "rgba(255,255,255,0.05)",
              color: voiceState === "recording"
                ? "rgba(252,165,165,0.9)"
                : voiceState === "speaking"
                  ? "rgba(110,231,183,0.9)"
                  : "rgba(255,255,255,0.4)",
              opacity: voiceState === "transcribing" || sending ? 0.4 : 1,
              transition: "all 0.15s ease",
            }}
          >
            {micIcon}
          </button>
        )}
        {/* Send button */}
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

      {/* Keyframe for recording pulse */}
      <style>{`
        @keyframes pulse-dot {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.4; transform: scale(0.8); }
        }
      `}</style>
    </div>
  );
}

export const AgentChatPanel = memo(AgentChatPanelInner);
export default AgentChatPanel;

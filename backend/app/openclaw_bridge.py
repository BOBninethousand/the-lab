"""
OpenClaw Gateway Bridge
Connects The Lab to OpenClaw's WebSocket Gateway (ws://localhost:18789)
so tasks, sessions, and status are visible in The Lab dashboard.

Implements Gateway Protocol v3 + device identity signing for connect handshake.
"""
import asyncio
import hashlib
import json
import os
import uuid
import logging
from datetime import datetime
from typing import Optional, List, Dict, Any

logger = logging.getLogger("openclaw_bridge")

DEFAULT_GATEWAY_URL = "ws://127.0.0.1:18789"

_DEVICE_KEY_DIR = os.path.join(os.path.expanduser("~"), ".the-lab")
_DEVICE_KEY_PATH = os.path.join(_DEVICE_KEY_DIR, "device_key.json")


def _ensure_device_keypair() -> dict:
    """Load or generate the Ed25519 device keypair for The Lab."""
    if os.path.isfile(_DEVICE_KEY_PATH):
        try:
            with open(_DEVICE_KEY_PATH) as f:
                data = json.load(f)
            if "private_key_hex" in data and "public_key_hex" in data and "device_id" in data:
                return data
        except Exception:
            pass

    from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
    from cryptography.hazmat.primitives import serialization

    private_key = Ed25519PrivateKey.generate()
    private_bytes = private_key.private_bytes(
        serialization.Encoding.Raw,
        serialization.PrivateFormat.Raw,
        serialization.NoEncryption(),
    )
    public_bytes = private_key.public_key().public_bytes(
        serialization.Encoding.Raw,
        serialization.PublicFormat.Raw,
    )

    device_id = hashlib.sha256(public_bytes).hexdigest()
    data = {
        "device_id": device_id,
        "private_key_hex": private_bytes.hex(),
        "public_key_hex": public_bytes.hex(),
    }

    os.makedirs(_DEVICE_KEY_DIR, exist_ok=True)
    with open(_DEVICE_KEY_PATH, "w") as f:
        json.dump(data, f, indent=2)
    os.chmod(_DEVICE_KEY_PATH, 0o600)
    logger.info("Generated new device keypair — device_id: %s...", device_id[:16])
    return data


def _b64url(raw: bytes) -> str:
    import base64

    return base64.urlsafe_b64encode(raw).decode("ascii").rstrip("=")


def _sign_payload(private_key_hex: str, payload: str) -> str:
    from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey

    private_key = Ed25519PrivateKey.from_private_bytes(bytes.fromhex(private_key_hex))
    sig = private_key.sign(payload.encode("utf-8"))
    return _b64url(sig)


def _build_v3_signature_payload(
    *,
    device_id: str,
    client_id: str,
    client_mode: str,
    role: str,
    scopes: List[str],
    signed_at_ms: int,
    token: Optional[str],
    nonce: str,
    platform: str,
    device_family: str,
) -> str:
    scopes_csv = ",".join(scopes)
    token_val = token or ""
    return "|".join([
        "v3",
        device_id,
        client_id,
        client_mode,
        role,
        scopes_csv,
        str(signed_at_ms),
        token_val,
        nonce,
        str(platform or "").strip().lower(),
        str(device_family or "").strip().lower(),
    ])


class OpenClawBridge:
    """Manages the WebSocket connection to OpenClaw Gateway."""

    def __init__(self, ws_manager=None, cost_tracker=None):
        self.gateway_url: str = os.getenv("OPENCLAW_GATEWAY_URL", DEFAULT_GATEWAY_URL)
        self.gateway_token: str = os.getenv("OPENCLAW_GATEWAY_TOKEN", "")
        self.gateway_password: str = os.getenv("OPENCLAW_GATEWAY_PASSWORD", "")
        self.ws_manager = ws_manager
        self.cost_tracker = cost_tracker
        self._ws = None
        self._connected = False
        self._protocol_version = 3
        self._sessions: Dict[str, dict] = {}
        self._activity_log: List[dict] = []
        self._max_activity = 200
        self._reconnect_task: Optional[asyncio.Task] = None
        self._listen_task: Optional[asyncio.Task] = None
        self._pending_requests: Dict[str, asyncio.Future] = {}
        self._response_collectors: Dict[str, asyncio.Future] = {}
        self._response_chunks: Dict[str, List[str]] = {}
        self._agent_sessions: Dict[str, str] = {}

    async def connect(self):
        """Establish WebSocket connection to OpenClaw Gateway."""
        try:
            import websockets

            logger.info("Connecting to OpenClaw Gateway at %s", self.gateway_url)
            self._ws = await websockets.connect(
                self.gateway_url,
                ping_interval=30,
                ping_timeout=10,
                close_timeout=5,
            )

            raw = await asyncio.wait_for(self._ws.recv(), timeout=10)
            challenge = json.loads(raw)
            if challenge.get("type") != "event" or challenge.get("event") != "connect.challenge":
                raise RuntimeError("gateway connect challenge missing")
            nonce = str((challenge.get("payload") or {}).get("nonce") or "").strip()
            if not nonce:
                raise RuntimeError("gateway connect challenge missing nonce")

            keypair = _ensure_device_keypair()
            client_id = "gateway-client"
            client_mode = "backend"
            role = "operator"
            scopes = ["operator.read", "operator.write", "operator.admin"]
            challenge_ts = (challenge.get("payload") or {}).get("ts")
            signed_at_ms = int(challenge_ts) if isinstance(challenge_ts, (int, float)) else int(datetime.utcnow().timestamp() * 1000)
            platform = "macos"
            device_family = "desktop"
            auth_token_for_sig = self.gateway_token or None
            sig_payload = _build_v3_signature_payload(
                device_id=keypair["device_id"],
                client_id=client_id,
                client_mode=client_mode,
                role=role,
                scopes=scopes,
                signed_at_ms=signed_at_ms,
                token=auth_token_for_sig,
                nonce=nonce,
                platform=platform,
                device_family=device_family,
            )
            signature_hex = _sign_payload(keypair["private_key_hex"], sig_payload)

            connect_req = {
                "type": "req",
                "id": str(uuid.uuid4()),
                "method": "connect",
                "params": {
                    "minProtocol": self._protocol_version,
                    "maxProtocol": self._protocol_version,
                    "client": {
                        "id": client_id,
                        "version": "1.0.0",
                        "platform": "macos",
                        "mode": client_mode,
                        "deviceFamily": "desktop",
                    },
                    "role": role,
                    "scopes": scopes,
                    "caps": ["tool-events"],
                    "auth": (
                        {"token": self.gateway_token}
                        if self.gateway_token
                        else ({"password": self.gateway_password} if self.gateway_password else {})
                    ),
                    "device": {
                        "id": keypair["device_id"],
                        "publicKey": _b64url(bytes.fromhex(keypair["public_key_hex"])),
                        "signature": signature_hex,
                        "signedAt": signed_at_ms,
                        "nonce": nonce,
                    },
                },
            }

            await self._ws.send(json.dumps(connect_req))

            raw = await asyncio.wait_for(self._ws.recv(), timeout=10)
            resp = json.loads(raw)
            if resp.get("type") == "res" and resp.get("ok", False):
                self._connected = True
                logger.info("Connected to OpenClaw Gateway successfully")
                self._log_activity("system", "Connected to OpenClaw Gateway")
                self._listen_task = asyncio.create_task(self._listen())
            else:
                error_msg = (resp.get("error") or {}).get("message", "Unknown error")
                logger.error("Gateway connect rejected: %s", error_msg)
                self._connected = False

        except ImportError:
            logger.warning("websockets package not installed — OpenClaw bridge disabled")
            self._connected = False
        except asyncio.TimeoutError:
            logger.warning("OpenClaw Gateway connection timed out")
            self._connected = False
        except ConnectionRefusedError:
            logger.info("OpenClaw Gateway not running — bridge inactive")
            self._connected = False
        except Exception as e:
            logger.warning("OpenClaw Gateway connection failed: %s", e)
            self._connected = False

    async def disconnect(self):
        self._connected = False
        if self._listen_task:
            self._listen_task.cancel()
        if self._ws:
            try:
                await self._ws.close()
            except Exception:
                pass
        self._ws = None
        logger.info("Disconnected from OpenClaw Gateway")

    async def ensure_connected(self) -> bool:
        if self._connected and self._ws:
            return True
        await self.connect()
        return self._connected

    async def _send_request(self, method: str, params: dict = None) -> dict:
        if not self._connected or not self._ws:
            return {"error": "Not connected to OpenClaw Gateway"}

        req_id = str(uuid.uuid4())
        request = {"type": "req", "id": req_id, "method": method}
        if params:
            request["params"] = params

        future = asyncio.get_event_loop().create_future()
        self._pending_requests[req_id] = future

        try:
            await self._ws.send(json.dumps(request))
            result = await asyncio.wait_for(future, timeout=30)
            return result
        except asyncio.TimeoutError:
            self._pending_requests.pop(req_id, None)
            return {"error": "Request timed out"}
        except Exception as e:
            self._pending_requests.pop(req_id, None)
            return {"error": str(e)}

    async def _listen(self):
        try:
            async for raw in self._ws:
                try:
                    msg = json.loads(raw)
                    await self._handle_message(msg)
                except json.JSONDecodeError:
                    continue
        except Exception as e:
            logger.warning("Gateway listener error: %s", e)
            self._connected = False

    async def _handle_message(self, msg: dict):
        msg_type = msg.get("type")
        if msg_type == "res":
            req_id = msg.get("id")
            if req_id in self._pending_requests:
                self._pending_requests[req_id].set_result(msg)
                del self._pending_requests[req_id]
            return

        if msg_type == "event":
            event = msg.get("event", "")
            payload = msg.get("payload", {})
            await self._handle_event(event, payload)

    async def _handle_event(self, event: str, payload: dict):
        if event in ("agent.turn.start", "agent.turn.chunk", "agent.turn.end"):
            session_id = payload.get("sessionId", "")

            if event == "agent.turn.chunk" and session_id in self._response_chunks:
                chunk_text = payload.get("text", "")
                if chunk_text:
                    self._response_chunks[session_id].append(chunk_text)

            if event == "agent.turn.end" and session_id in self._response_collectors:
                future = self._response_collectors.pop(session_id)
                full_text = payload.get("text", "")
                if not full_text and session_id in self._response_chunks:
                    full_text = "".join(self._response_chunks[session_id])
                self._response_chunks.pop(session_id, None)
                if not future.done():
                    future.set_result(full_text)

            self._log_activity("agent", event, {
                "session_id": session_id,
                "preview": payload.get("text", "")[:200] if payload.get("text") else "",
            })
            if self.ws_manager and event == "agent.turn.end":
                await self.ws_manager.broadcast("openclaw_event", {
                    "event": "turn_complete",
                    "session_id": session_id,
                    "text_preview": payload.get("text", "")[:300],
                })
        elif event in ("tool.call", "tool.result"):
            self._log_activity("tool", event, {
                "tool": payload.get("name", "unknown"),
                "session_id": payload.get("sessionId", ""),
            })
            if self.ws_manager:
                await self.ws_manager.broadcast("openclaw_event", {
                    "event": event,
                    "tool": payload.get("name", "unknown"),
                })
        elif event.startswith("session."):
            session_id = payload.get("id", payload.get("sessionId", ""))
            if session_id:
                self._sessions[session_id] = {
                    **self._sessions.get(session_id, {}),
                    **payload,
                    "last_event": event,
                    "updated_at": datetime.utcnow().isoformat(),
                }
            self._log_activity("session", event, {"session_id": session_id})
        elif event == "approval.request":
            self._log_activity("approval", "Approval requested", payload)
            if self.ws_manager:
                await self.ws_manager.broadcast("openclaw_event", {
                    "event": "approval_needed",
                    "detail": payload,
                })
        else:
            self._log_activity("event", event, payload)

    @property
    def is_connected(self) -> bool:
        return self._connected and self._ws is not None

    async def generate(
        self,
        prompt: str,
        system_prompt: Optional[str] = None,
        agent_name: str = "default",
        timeout: float = 120.0,
    ) -> dict:
        if not await self.ensure_connected():
            return {"error": "OpenClaw Gateway not connected"}

        try:
            session_key = self._get_or_create_agent_session(agent_name)
            full_prompt = prompt
            if system_prompt:
                full_prompt = (
                    f"IMPORTANT INSTRUCTIONS — follow these for every response:\n"
                    f"{system_prompt}\n\n"
                    f"---\n\n"
                    f"USER REQUEST:\n{prompt}"
                )

            before = await self._send_request("chat.history", {
                "sessionKey": session_key,
                "limit": 6,
            })
            before_msgs = (before.get("payload") or {}).get("messages", []) if isinstance(before, dict) else []
            before_count = len(before_msgs)

            sent_at_ms = int(datetime.utcnow().timestamp() * 1000)
            send_res = await self._send_request("chat.send", {
                "sessionKey": session_key,
                "message": full_prompt,
                "idempotencyKey": f"lab-{uuid.uuid4().hex}",
            })
            if send_res.get("ok") is False:
                err = (send_res.get("error") or {}).get("message", "chat.send failed")
                return {"error": f"Gateway send failed: {err}"}

            deadline = asyncio.get_event_loop().time() + timeout
            response_text = ""
            while asyncio.get_event_loop().time() < deadline:
                hist = await self._send_request("chat.history", {
                    "sessionKey": session_key,
                    "limit": 20,
                })
                if hist.get("ok") is False:
                    await asyncio.sleep(1.2)
                    continue
                msgs = (hist.get("payload") or {}).get("messages", [])
                if len(msgs) > before_count:
                    # Pick assistant reply corresponding to this exact user message
                    target_idx = -1
                    for i, m in enumerate(msgs):
                        if (m.get("role") or "").lower() != "user":
                            continue
                        user_text = self._extract_message_text(m)
                        ts = m.get("timestamp")
                        try:
                            ts_int = int(ts)
                        except Exception:
                            ts_int = 0
                        if ts_int and ts_int < sent_at_ms:
                            continue
                        if full_prompt.strip() in user_text:
                            target_idx = i
                    if target_idx >= 0:
                        for m in msgs[target_idx + 1:]:
                            if (m.get("role") or "").lower() != "assistant":
                                continue
                            ts = m.get("timestamp")
                            try:
                                ts_int = int(ts)
                            except Exception:
                                ts_int = 0
                            if ts_int and ts_int < sent_at_ms:
                                continue
                            candidate = self._extract_message_text(m)
                            if candidate.strip():
                                response_text = candidate
                                break
                if response_text.strip():
                    break
                await asyncio.sleep(1.2)

            if not response_text.strip():
                return {"error": f"OpenClaw response timed out after {timeout}s"}

            return {
                "response": response_text,
                "session_id": session_key,
                "input_tokens": max(len(full_prompt) // 4, 1),
                "output_tokens": max(len(response_text) // 4, 1),
            }
        except Exception as e:
            logger.error("OpenClaw generate error: %s", e)
            return {"error": f"OpenClaw generate failed: {str(e)}"}

    def _get_or_create_agent_session(self, agent_name: str) -> str:
        if agent_name in self._agent_sessions:
            return self._agent_sessions[agent_name]
        key = f"the-lab-v3-{agent_name}"
        self._agent_sessions[agent_name] = key
        return key

    def _extract_message_text(self, msg: dict) -> str:
        content = msg.get("content")
        if isinstance(content, str):
            return content
        if isinstance(content, list):
            parts = []
            for item in content:
                if isinstance(item, dict):
                    if isinstance(item.get("text"), str):
                        parts.append(item["text"])
                    elif isinstance(item.get("outputText"), str):
                        parts.append(item["outputText"])
            return "\n".join([p for p in parts if p]).strip()
        return ""

    async def get_status(self) -> dict:
        if not self._connected:
            return {
                "connected": False,
                "gateway_url": self.gateway_url,
                "sessions": 0,
                "activity_count": len(self._activity_log),
                "llm_proxy_available": False,
            }

        return {
            "connected": True,
            "gateway_url": self.gateway_url,
            "sessions": len(self._sessions),
            "activity_count": len(self._activity_log),
            "llm_proxy_available": True,
            "agent_sessions": {
                name: sid[:8] + "..." for name, sid in self._agent_sessions.items()
            },
        }

    async def list_sessions(self) -> list:
        if not await self.ensure_connected():
            return []

        result = await self._send_request("sessions.list")
        if "error" not in result:
            sessions = result.get("result", {}).get("sessions", [])
            for s in sessions:
                sid = s.get("id", "")
                if sid:
                    self._sessions[sid] = s
            return sessions
        return list(self._sessions.values())

    async def get_session_history(self, session_id: str) -> list:
        if not await self.ensure_connected():
            return []

        result = await self._send_request("sessions.history", {"sessionId": session_id})
        if "error" not in result:
            return result.get("result", {}).get("messages", [])
        return []

    async def send_message(self, session_id: str, text: str) -> dict:
        if not await self.ensure_connected():
            return {"error": "Not connected to OpenClaw Gateway"}

        self._log_activity("user", f"Sent message to session {session_id[:8]}...", {"text": text[:100]})
        result = await self._send_request("sessions.send", {
            "sessionId": session_id,
            "message": {"role": "user", "content": text},
        })
        if "error" not in result and self.ws_manager:
            await self.ws_manager.broadcast("openclaw_event", {
                "event": "message_sent",
                "session_id": session_id,
            })
        return result

    async def create_session(self, name: str = None) -> dict:
        if not await self.ensure_connected():
            return {"error": "Not connected to OpenClaw Gateway"}

        params = {}
        if name:
            params["name"] = name

        result = await self._send_request("sessions.create", params)
        if "error" not in result:
            session = result.get("result", {})
            sid = session.get("id", "")
            if sid:
                self._sessions[sid] = session
            self._log_activity("session", f"Created session: {name or sid[:8]}")
        return result

    async def get_provider_info(self) -> dict:
        if not await self.ensure_connected():
            return await self._detect_auth_profiles()

        result = await self._send_request("status", {})
        provider_info = {
            "providers": [],
            "primary_model": None,
            "oauth_profiles": [],
            "api_key_providers": [],
        }

        if "error" not in result:
            status_data = result.get("result", {})
            provider_info["primary_model"] = status_data.get("model")
            providers = status_data.get("providers", [])
            provider_info["providers"] = providers

            for p in providers:
                auth_type = p.get("auth", "")
                name = p.get("name", p.get("id", ""))
                if "oauth" in auth_type.lower() or "codex" in name.lower():
                    provider_info["oauth_profiles"].append(name)
                elif "key" in auth_type.lower() or "api" in auth_type.lower():
                    provider_info["api_key_providers"].append(name)

        fs_info = await self._detect_auth_profiles()
        for p in fs_info.get("oauth_profiles", []):
            if p not in provider_info["oauth_profiles"]:
                provider_info["oauth_profiles"].append(p)
        if not provider_info.get("primary_model"):
            provider_info["primary_model"] = fs_info.get("primary_model")

        return provider_info

    async def _detect_auth_profiles(self) -> dict:
        home = os.path.expanduser("~")
        auth_dir = os.path.join(home, ".openclaw", "auth-profiles")
        result = {
            "oauth_profiles": [],
            "api_key_providers": [],
            "primary_model": None,
        }

        if os.path.isdir(auth_dir):
            for f in os.listdir(auth_dir):
                if f.endswith(".json"):
                    result["oauth_profiles"].append(f.replace(".json", ""))

        # Also support OpenClaw's agent auth store layout
        # ~/.openclaw/agents/main/agent/auth-profiles.json
        agent_auth_profiles = os.path.join(home, ".openclaw", "agents", "main", "agent", "auth-profiles.json")
        if os.path.isfile(agent_auth_profiles):
            try:
                with open(agent_auth_profiles) as fh:
                    data = json.load(fh)
                profiles = data.get("profiles", {}) if isinstance(data, dict) else {}
                if isinstance(profiles, dict):
                    for provider in profiles.keys():
                        if isinstance(provider, str) and provider.strip():
                            name = provider.strip()
                            if name not in result["oauth_profiles"]:
                                result["oauth_profiles"].append(name)
            except Exception:
                pass

        config_path = os.path.join(home, ".openclaw", "openclaw.json")
        if os.path.isfile(config_path):
            try:
                with open(config_path) as fh:
                    config = json.load(fh)
                result["primary_model"] = (
                    config.get("agents", {})
                    .get("defaults", {})
                    .get("model", {})
                    .get("primary")
                )
            except Exception:
                pass

        return result

    def get_activity(self, limit: int = 50) -> list:
        return self._activity_log[-limit:][::-1]

    def _log_activity(self, category: str, description: str, detail: dict = None):
        entry = {
            "id": str(uuid.uuid4())[:8],
            "category": category,
            "description": description,
            "detail": detail or {},
            "timestamp": datetime.utcnow().isoformat(),
        }
        self._activity_log.append(entry)
        if len(self._activity_log) > self._max_activity:
            self._activity_log = self._activity_log[-self._max_activity:]

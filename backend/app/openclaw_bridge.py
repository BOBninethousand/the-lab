"""
OpenClaw Gateway Bridge
Connects The Lab to OpenClaw's WebSocket Gateway (ws://localhost:18789)
so tasks, sessions, and status are visible in The Lab dashboard.
"""
import asyncio
import json
import os
import time
import uuid
import logging
from datetime import datetime
from typing import Optional, List, Dict, Any

logger = logging.getLogger("openclaw_bridge")

# Default gateway location
DEFAULT_GATEWAY_URL = "ws://127.0.0.1:18789"


class OpenClawBridge:
    """Manages the WebSocket connection to OpenClaw Gateway."""

    def __init__(self, ws_manager=None, cost_tracker=None):
        self.gateway_url: str = os.getenv(
            "OPENCLAW_GATEWAY_URL", DEFAULT_GATEWAY_URL
        )
        self.gateway_token: str = os.getenv("OPENCLAW_GATEWAY_TOKEN", "")
        self.ws_manager = ws_manager      # Lab's internal WS manager
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

    # ------------------------------------------------------------------
    # Connection lifecycle
    # ------------------------------------------------------------------

    async def connect(self):
        """Establish WebSocket connection to OpenClaw Gateway."""
        try:
            import websockets
            logger.info(f"Connecting to OpenClaw Gateway at {self.gateway_url}")
            self._ws = await websockets.connect(
                self.gateway_url,
                ping_interval=30,
                ping_timeout=10,
                close_timeout=5,
            )

            # Wait for the connect challenge
            raw = await asyncio.wait_for(self._ws.recv(), timeout=10)
            challenge = json.loads(raw)
            logger.info(f"Received challenge: {challenge.get('event', 'unknown')}")

            # Send connect request
            connect_req = {
                "type": "req",
                "id": str(uuid.uuid4()),
                "method": "connect",
                "params": {
                    "minProtocol": self._protocol_version,
                    "maxProtocol": self._protocol_version,
                    "client": {
                        "id": "the-lab",
                        "version": "1.0.0",
                        "platform": "web",
                        "mode": "control",
                    },
                    "role": "control",
                    "scopes": [],
                },
            }

            if self.gateway_token:
                connect_req["params"]["auth"] = {"token": self.gateway_token}

            await self._ws.send(json.dumps(connect_req))

            # Wait for connect response
            raw = await asyncio.wait_for(self._ws.recv(), timeout=10)
            resp = json.loads(raw)
            if resp.get("type") == "res" and not resp.get("error"):
                self._connected = True
                logger.info("Connected to OpenClaw Gateway successfully")
                self._log_activity("system", "Connected to OpenClaw Gateway")

                # Start listening in background
                self._listen_task = asyncio.create_task(self._listen())
            else:
                error_msg = resp.get("error", {}).get("message", "Unknown error")
                logger.error(f"Gateway connect rejected: {error_msg}")
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
            logger.warning(f"OpenClaw Gateway connection failed: {e}")
            self._connected = False

    async def disconnect(self):
        """Close the Gateway connection."""
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
        """Try to connect if not already connected."""
        if self._connected and self._ws:
            return True
        await self.connect()
        return self._connected

    # ------------------------------------------------------------------
    # Gateway RPC
    # ------------------------------------------------------------------

    async def _send_request(self, method: str, params: dict = None) -> dict:
        """Send an RPC request to the Gateway and wait for response."""
        if not self._connected or not self._ws:
            return {"error": "Not connected to OpenClaw Gateway"}

        req_id = str(uuid.uuid4())
        request = {
            "type": "req",
            "id": req_id,
            "method": method,
        }
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
        """Listen for messages from the Gateway."""
        try:
            async for raw in self._ws:
                try:
                    msg = json.loads(raw)
                    await self._handle_message(msg)
                except json.JSONDecodeError:
                    continue
        except Exception as e:
            logger.warning(f"Gateway listener error: {e}")
            self._connected = False

    async def _handle_message(self, msg: dict):
        """Process incoming Gateway message."""
        msg_type = msg.get("type")

        # Response to a pending request
        if msg_type == "res":
            req_id = msg.get("id")
            if req_id in self._pending_requests:
                self._pending_requests[req_id].set_result(msg)
                del self._pending_requests[req_id]
            return

        # Events from the Gateway
        if msg_type == "event":
            event = msg.get("event", "")
            payload = msg.get("payload", {})
            await self._handle_event(event, payload)

    async def _handle_event(self, event: str, payload: dict):
        """Handle Gateway events and relay them to Lab's dashboard."""

        # Agent turn events — the main content stream
        if event in ("agent.turn.start", "agent.turn.chunk", "agent.turn.end"):
            session_id = payload.get("sessionId", "")
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

        # Tool call events
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

        # Session events
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

        # Approval required
        elif event == "approval.request":
            self._log_activity("approval", "Approval requested", payload)
            if self.ws_manager:
                await self.ws_manager.broadcast("openclaw_event", {
                    "event": "approval_needed",
                    "detail": payload,
                })

        # Generic — just log it
        else:
            self._log_activity("event", event, payload)

    # ------------------------------------------------------------------
    # Public API — used by The Lab endpoints
    # ------------------------------------------------------------------

    async def get_status(self) -> dict:
        """Get OpenClaw Gateway status."""
        if not self._connected:
            return {
                "connected": False,
                "gateway_url": self.gateway_url,
                "sessions": 0,
                "activity_count": len(self._activity_log),
            }

        return {
            "connected": True,
            "gateway_url": self.gateway_url,
            "sessions": len(self._sessions),
            "activity_count": len(self._activity_log),
        }

    async def list_sessions(self) -> list:
        """List active OpenClaw sessions."""
        if not await self.ensure_connected():
            return []

        result = await self._send_request("sessions.list")
        if "error" not in result:
            sessions = result.get("result", {}).get("sessions", [])
            # Update local cache
            for s in sessions:
                sid = s.get("id", "")
                if sid:
                    self._sessions[sid] = s
            return sessions
        return list(self._sessions.values())

    async def get_session_history(self, session_id: str) -> list:
        """Get conversation history for a session."""
        if not await self.ensure_connected():
            return []

        result = await self._send_request("sessions.history", {
            "sessionId": session_id
        })
        if "error" not in result:
            return result.get("result", {}).get("messages", [])
        return []

    async def send_message(self, session_id: str, text: str) -> dict:
        """Send a message to an OpenClaw session."""
        if not await self.ensure_connected():
            return {"error": "Not connected to OpenClaw Gateway"}

        self._log_activity("user", f"Sent message to session {session_id[:8]}...", {
            "text": text[:100],
        })

        result = await self._send_request("sessions.send", {
            "sessionId": session_id,
            "message": {"role": "user", "content": text},
        })

        if "error" not in result:
            if self.ws_manager:
                await self.ws_manager.broadcast("openclaw_event", {
                    "event": "message_sent",
                    "session_id": session_id,
                })
        return result

    async def create_session(self, name: str = None) -> dict:
        """Create a new OpenClaw session."""
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
        """Get OpenClaw's configured providers and auth profiles."""
        if not await self.ensure_connected():
            # Fallback: check the filesystem for auth profiles
            return await self._detect_auth_profiles()

        # Try to get status from Gateway which may include model/provider info
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

        # Also check filesystem for auth profiles
        fs_info = await self._detect_auth_profiles()
        # Merge — filesystem profiles may have info Gateway didn't report
        for p in fs_info.get("oauth_profiles", []):
            if p not in provider_info["oauth_profiles"]:
                provider_info["oauth_profiles"].append(p)

        return provider_info

    async def _detect_auth_profiles(self) -> dict:
        """Check ~/.openclaw/auth-profiles/ for OAuth config files."""
        import glob as glob_mod
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
                    profile_name = f.replace(".json", "")
                    result["oauth_profiles"].append(profile_name)

        # Check openclaw.json for primary model
        config_path = os.path.join(home, ".openclaw", "openclaw.json")
        if os.path.isfile(config_path):
            try:
                with open(config_path) as fh:
                    config = json.load(fh)
                    agents = config.get("agents", {})
                    defaults = agents.get("defaults", {})
                    model = defaults.get("model", {})
                    result["primary_model"] = model.get("primary")
            except Exception:
                pass

        return result

    def get_activity(self, limit: int = 50) -> list:
        """Get recent OpenClaw activity log."""
        return self._activity_log[-limit:][::-1]  # Most recent first

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _log_activity(self, category: str, description: str, detail: dict = None):
        """Append to the in-memory activity log."""
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

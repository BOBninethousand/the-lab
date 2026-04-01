"""Authentication module — JWT-based single-user auth for The Lab."""

import base64
import hashlib
import hmac
import json
import time
from typing import Optional

import bcrypt as _bcrypt

from app.config import settings

TOKEN_EXPIRY_HOURS = 24
MAX_LOGIN_ATTEMPTS = 5
LOCKOUT_SECONDS = 300

_login_attempts: dict = {}


def verify_password(plain: str, hashed: str) -> bool:
    try:
        return _bcrypt.checkpw(plain.encode(), hashed.encode())
    except Exception:
        return False


def _b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


def _b64url_decode(s: str) -> bytes:
    padding = 4 - len(s) % 4
    return base64.urlsafe_b64decode(s + "=" * padding)


def create_token(email: str) -> str:
    secret = settings.LAB_JWT_SECRET
    header = _b64url(json.dumps({"alg": "HS256", "typ": "JWT"}).encode())
    payload = _b64url(json.dumps({
        "email": email,
        "iat": int(time.time()),
        "exp": int(time.time()) + (TOKEN_EXPIRY_HOURS * 3600),
    }).encode())
    sig_input = f"{header}.{payload}".encode()
    signature = _b64url(hmac.new(secret.encode(), sig_input, hashlib.sha256).digest())
    return f"{header}.{payload}.{signature}"


def verify_token(token: str) -> Optional[dict]:
    try:
        parts = token.split(".")
        if len(parts) != 3:
            return None
        header, payload, signature = parts
        sig_input = f"{header}.{payload}".encode()
        expected = _b64url(hmac.new(settings.LAB_JWT_SECRET.encode(), sig_input, hashlib.sha256).digest())
        if not hmac.compare_digest(signature, expected):
            return None
        data = json.loads(_b64url_decode(payload))
        if data.get("exp", 0) < time.time():
            return None
        return data
    except Exception:
        return None


def check_rate_limit(ip: str) -> bool:
    now = time.time()
    if ip in _login_attempts:
        info = _login_attempts[ip]
        if now - info["first_attempt"] > LOCKOUT_SECONDS:
            del _login_attempts[ip]
            return False
        return info["count"] >= MAX_LOGIN_ATTEMPTS
    return False


def record_attempt(ip: str):
    now = time.time()
    if ip not in _login_attempts:
        _login_attempts[ip] = {"count": 1, "first_attempt": now}
    else:
        _login_attempts[ip]["count"] += 1


def login(email: str, password: str, ip: str) -> Optional[str]:
    if check_rate_limit(ip):
        return None
    if email.strip().lower() != settings.LAB_AUTH_EMAIL.lower():
        record_attempt(ip)
        return None
    if not verify_password(password, settings.LAB_AUTH_HASH):
        record_attempt(ip)
        return None
    _login_attempts.pop(ip, None)
    return create_token(email.strip().lower())

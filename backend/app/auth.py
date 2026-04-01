import time
import jwt
import bcrypt as _bcrypt
from datetime import datetime, timezone, timedelta
from app.config import settings

TOKEN_EXPIRY_HOURS = 24
ALGORITHM = "HS256"


def verify_password(plain: str, hashed: str) -> bool:
    try:
        return _bcrypt.checkpw(plain.encode(), hashed.encode())
    except Exception:
        return False


def create_token(email: str) -> str:
    payload = {
        "sub": email,
        "iat": datetime.now(timezone.utc),
        "exp": datetime.now(timezone.utc) + timedelta(hours=TOKEN_EXPIRY_HOURS),
    }
    return jwt.encode(payload, settings.LAB_JWT_SECRET, algorithm=ALGORITHM)


def decode_token(token: str) -> dict | None:
    try:
        return jwt.decode(token, settings.LAB_JWT_SECRET, algorithms=[ALGORITHM])
    except (jwt.ExpiredSignatureError, jwt.InvalidTokenError):
        return None


class LoginRateLimiter:
    """Sliding-window rate limiter: max_attempts per window_seconds per IP."""

    def __init__(self, max_attempts: int = 5, window_seconds: int = 900):
        self.max_attempts = max_attempts
        self.window_seconds = window_seconds
        self._attempts: dict[str, list[float]] = {}

    def is_blocked(self, ip: str) -> bool:
        now = time.time()
        cutoff = now - self.window_seconds
        timestamps = self._attempts.get(ip, [])
        # Prune old entries
        timestamps = [t for t in timestamps if t > cutoff]
        self._attempts[ip] = timestamps
        return len(timestamps) >= self.max_attempts

    def record_attempt(self, ip: str) -> None:
        now = time.time()
        if ip not in self._attempts:
            self._attempts[ip] = []
        self._attempts[ip].append(now)

    def seconds_until_reset(self, ip: str) -> int:
        timestamps = self._attempts.get(ip, [])
        if not timestamps:
            return 0
        oldest_in_window = min(timestamps)
        return max(0, int(self.window_seconds - (time.time() - oldest_in_window)))


login_rate_limiter = LoginRateLimiter()

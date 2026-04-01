import logging
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse, Response
from app.auth import decode_token

logger = logging.getLogger(__name__)

PUBLIC_PATHS = {
    "/api/auth/login",
    "/api/auth/check",
    "/api/auth/logout",
    "/api/health",
}

PUBLIC_PREFIXES = (
    "/assets/",
)

SECURITY_HEADERS = {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
    "Referrer-Policy": "strict-origin-when-cross-origin",
}


class AuthMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next) -> Response:
        path = request.url.path

        # Skip auth for public paths and non-API paths (SPA static files)
        needs_auth = (
            path.startswith("/api/")
            and path not in PUBLIC_PATHS
            and not any(path.startswith(p) for p in PUBLIC_PREFIXES)
        )

        if needs_auth:
            token = request.cookies.get("lab_session")
            if not token or not decode_token(token):
                return JSONResponse(
                    status_code=401,
                    content={"detail": "Not authenticated"},
                )

        response = await call_next(request)

        # Add security headers to all responses
        for header, value in SECURITY_HEADERS.items():
            response.headers[header] = value

        return response

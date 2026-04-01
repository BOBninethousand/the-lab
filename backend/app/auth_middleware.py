import logging
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse, Response
from app.auth import verify_token

logger = logging.getLogger(__name__)

OPEN_PATHS = {
    "/api/auth/login",
    "/api/auth/verify",
    "/api/health",
    "/docs",
    "/openapi.json",
}

SECURITY_HEADERS = {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
    "Referrer-Policy": "strict-origin-when-cross-origin",
}


class AuthMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next) -> Response:
        path = request.url.path

        needs_auth = (
            path.startswith("/api/")
            and path not in OPEN_PATHS
            and request.method != "OPTIONS"
        )

        if needs_auth:
            auth_header = request.headers.get("Authorization", "")
            token = auth_header[7:] if auth_header.startswith("Bearer ") else None
            if not token or not verify_token(token):
                return JSONResponse(
                    status_code=401,
                    content={"detail": "Not authenticated"},
                )

        response = await call_next(request)

        for header, value in SECURITY_HEADERS.items():
            response.headers[header] = value

        return response

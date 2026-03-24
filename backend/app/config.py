import os
from dotenv import load_dotenv

load_dotenv()


class Settings:
    OPENAI_API_KEY: str = os.getenv("OPENAI_API_KEY", "")
    OPENAI_BASE_URL: str = os.getenv("OPENAI_BASE_URL", "https://api.openai.com/v1")
    ANTHROPIC_API_KEY: str = os.getenv("ANTHROPIC_API_KEY", "")
    OLLAMA_BASE_URL: str = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
    DISCORD_BOT_TOKEN: str = os.getenv("DISCORD_BOT_TOKEN", "")
    DISCORD_CHANNEL_BRIEFS: str = os.getenv("DISCORD_CHANNEL_BRIEFS", "")
    DISCORD_CHANNEL_CONTENT: str = os.getenv("DISCORD_CHANNEL_CONTENT", "")
    DISCORD_CHANNEL_ALERTS: str = os.getenv("DISCORD_CHANNEL_ALERTS", "")
    DISCORD_CHANNEL_DIGEST: str = os.getenv("DISCORD_CHANNEL_DIGEST", "")
    OPENCLAW_GATEWAY_URL: str = os.getenv("OPENCLAW_GATEWAY_URL", "ws://127.0.0.1:18789")
    OPENCLAW_GATEWAY_TOKEN: str = os.getenv("OPENCLAW_GATEWAY_TOKEN", "")
    USE_OPENCLAW_FOR_AGENTS: bool = os.getenv("USE_OPENCLAW_FOR_AGENTS", "false").lower() in ("1", "true", "yes", "on")
    SERVER_HOST: str = os.getenv("SERVER_HOST", "0.0.0.0")
    SERVER_PORT: int = int(os.getenv("SERVER_PORT", "8000"))
    DATA_DIR: str = os.getenv("DATA_DIR", "./data")


settings = Settings()

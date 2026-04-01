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
    NOTION_API_KEY: str = os.getenv("NOTION_API_KEY", "")
    NOTION_DATABASE_ID: str = os.getenv("NOTION_DATABASE_ID", "")
    NOTION_PARENT_PAGE_ID: str = os.getenv("NOTION_PARENT_PAGE_ID", "")
    IMPORT_ALLOWED_DIRS: str = os.getenv("IMPORT_ALLOWED_DIRS", "")  # comma-separated allowed base directories for file import

    # Authentication (defaults allow deploy without .env changes on M1)
    LAB_AUTH_EMAIL: str = os.getenv("LAB_AUTH_EMAIL", "team@irislab.com")
    LAB_AUTH_HASH: str = os.getenv("LAB_AUTH_HASH", "$2b$12$jdy8DMMV9hpaPV8shY455uMhBixnequYwC18n.oVplGGf.7jyuzNW")
    LAB_JWT_SECRET: str = os.getenv("LAB_JWT_SECRET", "da370647913609b12e3f0073b3645f75e343c50ab64b04f1a6498495d54659ca")


settings = Settings()

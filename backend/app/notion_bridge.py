import logging
from typing import Optional, List, Dict, Any
from app.config import settings

logger = logging.getLogger(__name__)


class NotionBridge:
    """Stub for future Notion integration. Knowledge Base entries with notion_page_id
    will sync through this bridge once configured."""

    def __init__(self):
        self.api_key = getattr(settings, "NOTION_API_KEY", None)
        self.database_id = getattr(settings, "NOTION_DATABASE_ID", None)
        self.configured = bool(self.api_key and self.database_id)

    async def sync_from_notion(self) -> List[Dict[str, Any]]:
        if not self.configured:
            logger.info("Notion integration not configured — skipping sync")
            return []
        # Future: Pull pages from Notion database, return as knowledge entries
        return []

    async def export_to_notion(self, entry: Dict[str, Any]) -> Optional[str]:
        if not self.configured:
            logger.info("Notion integration not configured — skipping export")
            return None
        # Future: Push knowledge entry to Notion, return page_id
        return None

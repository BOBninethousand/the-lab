import httpx
import json
import logging
from datetime import datetime
from typing import Optional, List, Dict, Any
from app.config import settings

logger = logging.getLogger(__name__)

NOTION_VERSION = "2022-06-28"


class NotionBridge:
    BASE_URL = "https://api.notion.com/v1"

    def __init__(self):
        self.api_key = settings.NOTION_API_KEY
        self.database_id = settings.NOTION_DATABASE_ID
        self.configured = bool(self.api_key and self.database_id)
        self.last_sync = None
        self._cached_tasks: List[Dict[str, Any]] = []

    def _headers(self) -> dict:
        return {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
            "Notion-Version": NOTION_VERSION,
        }

    # --- Core API Methods ---

    async def query_database(self, filters: dict = None) -> List[dict]:
        if not self.configured:
            return []
        try:
            body = {}
            if filters:
                body["filter"] = filters
            async with httpx.AsyncClient(timeout=30.0) as client:
                resp = await client.post(
                    f"{self.BASE_URL}/databases/{self.database_id}/query",
                    headers=self._headers(),
                    json=body,
                )
                if resp.status_code == 200:
                    return resp.json().get("results", [])
                else:
                    logger.error(f"Notion query failed: {resp.status_code} {resp.text[:200]}")
                    return []
        except Exception as e:
            logger.error(f"Notion query error: {e}")
            return []

    async def get_page(self, page_id: str) -> Optional[dict]:
        if not self.configured:
            return None
        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                resp = await client.get(
                    f"{self.BASE_URL}/pages/{page_id}",
                    headers=self._headers(),
                )
                if resp.status_code == 200:
                    return resp.json()
                return None
        except Exception as e:
            logger.error(f"Notion get_page error: {e}")
            return None

    async def update_page(self, page_id: str, properties: dict) -> bool:
        if not self.configured:
            return False
        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                resp = await client.patch(
                    f"{self.BASE_URL}/pages/{page_id}",
                    headers=self._headers(),
                    json={"properties": properties},
                )
                if resp.status_code == 200:
                    return True
                logger.error(f"Notion update failed: {resp.status_code} {resp.text[:200]}")
                return False
        except Exception as e:
            logger.error(f"Notion update error: {e}")
            return False

    async def get_page_content(self, page_id: str) -> str:
        """Fetch page block content as plain text."""
        if not self.configured:
            return ""
        try:
            blocks = []
            async with httpx.AsyncClient(timeout=15.0) as client:
                resp = await client.get(
                    f"{self.BASE_URL}/blocks/{page_id}/children?page_size=100",
                    headers=self._headers(),
                )
                if resp.status_code == 200:
                    blocks = resp.json().get("results", [])

            text_parts = []
            for block in blocks:
                block_type = block.get("type", "")
                block_data = block.get(block_type, {})
                rich_texts = block_data.get("rich_text", [])
                for rt in rich_texts:
                    text_parts.append(rt.get("plain_text", ""))
            return "\n".join(text_parts)
        except Exception as e:
            logger.error(f"Notion content error: {e}")
            return ""

    async def check_connection(self) -> dict:
        """Test connection — tries as database first, falls back to page."""
        if not self.configured:
            return {"connected": False, "reason": "Not configured — set NOTION_API_KEY and NOTION_DATABASE_ID in .env"}
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                # Try as database first
                resp = await client.get(
                    f"{self.BASE_URL}/databases/{self.database_id}",
                    headers=self._headers(),
                )
                if resp.status_code == 200:
                    data = resp.json()
                    title_parts = data.get("title", [])
                    title = "".join(t.get("plain_text", "") for t in title_parts) if title_parts else "Unknown"
                    return {
                        "connected": True,
                        "type": "database",
                        "database_name": title,
                        "database_id": self.database_id,
                        "last_sync": self.last_sync,
                    }
                elif resp.status_code == 401:
                    return {"connected": False, "reason": "Invalid API key"}

                # Fall back to page
                resp = await client.get(
                    f"{self.BASE_URL}/pages/{self.database_id}",
                    headers=self._headers(),
                )
                if resp.status_code == 200:
                    data = resp.json()
                    props = data.get("properties", {})
                    title_prop = props.get("title", {})
                    title = self._extract_text_property(title_prop) if title_prop else "Connected Page"
                    return {
                        "connected": True,
                        "type": "page",
                        "database_name": title or "Connected Page",
                        "database_id": self.database_id,
                        "last_sync": self.last_sync,
                    }
                elif resp.status_code == 404:
                    return {"connected": False, "reason": "Page/database not found — make sure it's shared with the integration"}
                else:
                    return {"connected": False, "reason": f"API error: {resp.status_code}"}
        except Exception as e:
            return {"connected": False, "reason": str(e)}

    # --- High-Level Methods ---

    def _extract_text_property(self, prop: dict) -> str:
        if not prop:
            return ""
        prop_type = prop.get("type", "")
        if prop_type == "title":
            return "".join(t.get("plain_text", "") for t in prop.get("title", []))
        elif prop_type == "rich_text":
            return "".join(t.get("plain_text", "") for t in prop.get("rich_text", []))
        elif prop_type == "select":
            sel = prop.get("select")
            return sel.get("name", "") if sel else ""
        elif prop_type == "number":
            return str(prop.get("number", ""))
        return ""

    def _normalize_task(self, page: dict) -> dict:
        props = page.get("properties", {})
        return {
            "notion_page_id": page["id"],
            "title": self._extract_text_property(props.get("Task", {})),
            "status": self._extract_text_property(props.get("Status", {})),
            "priority": self._extract_text_property(props.get("Priority", {})),
            "project": self._extract_text_property(props.get("Project", {})),
            "agent": self._extract_text_property(props.get("Agent", {})),
            "source": self._extract_text_property(props.get("Source", {})),
            "handoff_notes": self._extract_text_property(props.get("Handoff Notes", {})),
            "blockers": self._extract_text_property(props.get("Blockers", {})),
            "result": self._extract_text_property(props.get("Result", {})),
            "created": page.get("created_time", ""),
            "updated": page.get("last_edited_time", ""),
            "url": page.get("url", ""),
        }

    async def pull_new_tasks(self) -> List[Dict[str, Any]]:
        """Pull tasks with Status = New or Acknowledged from Agent Ops."""
        filters = {
            "or": [
                {"property": "Status", "select": {"equals": "New"}},
                {"property": "Status", "select": {"equals": "Acknowledged"}},
            ]
        }
        pages = await self.query_database(filters)
        tasks = [self._normalize_task(p) for p in pages]
        self._cached_tasks = tasks
        self.last_sync = datetime.now().isoformat()
        logger.info(f"Pulled {len(tasks)} tasks from Notion")
        return tasks

    async def pull_all_active_tasks(self) -> List[Dict[str, Any]]:
        """Pull all non-Done/Cancelled tasks."""
        filters = {
            "and": [
                {"property": "Status", "select": {"does_not_equal": "Done"}},
                {"property": "Status", "select": {"does_not_equal": "Cancelled"}},
            ]
        }
        pages = await self.query_database(filters)
        tasks = [self._normalize_task(p) for p in pages]
        self._cached_tasks = tasks
        self.last_sync = datetime.now().isoformat()
        return tasks

    def get_cached_tasks(self) -> List[Dict[str, Any]]:
        return self._cached_tasks

    async def push_result(
        self,
        page_id: str,
        result_text: str,
        agent_name: str = None,
        status: str = "Done",
    ) -> bool:
        """Push task result back to Notion — update Result, Status, and optionally Agent."""
        properties = {
            "Result": {"rich_text": [{"text": {"content": result_text[:2000]}}]},
            "Status": {"select": {"name": status}},
        }
        if agent_name:
            properties["Agent"] = {"select": {"name": agent_name}}
        return await self.update_page(page_id, properties)

    async def set_status(self, page_id: str, status: str, blockers: str = None) -> bool:
        """Update just the status (and optionally blockers) of a Notion task."""
        properties = {"Status": {"select": {"name": status}}}
        if blockers:
            properties["Blockers"] = {"rich_text": [{"text": {"content": blockers[:2000]}}]}
        return await self.update_page(page_id, properties)

    async def sync_page_to_knowledge(self, page_id: str, knowledge_manager) -> Optional[dict]:
        """Fetch a Notion page and create/update a Knowledge Base entry."""
        page = await self.get_page(page_id)
        if not page:
            return None

        props = page.get("properties", {})
        title = self._extract_text_property(props.get("Task", {})) or self._extract_text_property(props.get("title", {})) or "Untitled"
        content = await self.get_page_content(page_id)
        if not content:
            content = f"Notion page: {title}"

        # Check if knowledge entry already exists for this page
        existing = knowledge_manager.get_all()
        for entry in existing:
            if entry.notion_page_id == page_id:
                await knowledge_manager.update(entry.id, {
                    "title": title,
                    "content": content,
                })
                return {"id": entry.id, "title": title, "action": "updated"}

        from app.models import KnowledgeCreate
        entry = await knowledge_manager.add(KnowledgeCreate(
            title=title,
            content=content,
            tags=["notion-sync"],
            category="reference",
            notion_page_id=page_id,
        ))
        return {"id": entry.id, "title": title, "action": "created"}

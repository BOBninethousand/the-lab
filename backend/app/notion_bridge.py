import httpx
import json
import os
import logging
from datetime import datetime
from typing import Optional, List, Dict, Any
from app.config import settings

logger = logging.getLogger(__name__)

NOTION_VERSION = "2022-06-28"

AGENT_EMOJIS = {
    "Scout": "🔍",
    "Quill": "✏️",
    "Forge": "🔨",
    "Radar": "📡",
}

REPORT_TYPE_EMOJIS = {
    "briefing": "📋",
    "content": "📝",
    "tech_report": "⚙️",
    "outreach": "📧",
    "weekly_review": "📊",
    "content_calendar": "📅",
}


class NotionBridge:
    BASE_URL = "https://api.notion.com/v1"

    def __init__(self):
        self.api_key = settings.NOTION_API_KEY
        self.database_id = settings.NOTION_DATABASE_ID
        self.configured = bool(self.api_key and self.database_id)
        self.last_sync = None
        self._cached_tasks: List[Dict[str, Any]] = []
        self._agent_dbs: Dict[str, str] = {}  # agent_name -> notion database_id
        self._agent_dbs_file = f"{settings.DATA_DIR}/notion_agent_dbs.json"
        self._load_agent_dbs()

    def _load_agent_dbs(self):
        if os.path.exists(self._agent_dbs_file):
            try:
                with open(self._agent_dbs_file, "r") as f:
                    self._agent_dbs = json.load(f)
            except Exception:
                self._agent_dbs = {}

    def _save_agent_dbs(self):
        os.makedirs(os.path.dirname(self._agent_dbs_file), exist_ok=True)
        with open(self._agent_dbs_file, "w") as f:
            json.dump(self._agent_dbs, f, indent=2)

    async def _get_or_create_agent_db(self, agent_name: str) -> Optional[str]:
        """Get or create a Notion database for an agent."""
        if agent_name in self._agent_dbs:
            return self._agent_dbs[agent_name]

        if not self.configured:
            return None

        emoji = AGENT_EMOJIS.get(agent_name, "🤖")
        db_title = f"The Lab — {agent_name}"

        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                resp = await client.post(
                    f"{self.BASE_URL}/databases",
                    headers=self._headers(),
                    json={
                        "parent": {"page_id": self.database_id},
                        "icon": {"type": "emoji", "emoji": emoji},
                        "title": [{"type": "text", "text": {"content": db_title}}],
                        "properties": {
                            "Title": {"title": {}},
                            "Type": {
                                "select": {
                                    "options": [
                                        {"name": "Briefing", "color": "blue"},
                                        {"name": "Content", "color": "green"},
                                        {"name": "Tech Report", "color": "purple"},
                                        {"name": "Outreach", "color": "orange"},
                                        {"name": "Weekly Review", "color": "yellow"},
                                        {"name": "Content Calendar", "color": "pink"},
                                    ]
                                }
                            },
                            "Date": {"date": {}},
                            "Source": {
                                "select": {
                                    "options": [
                                        {"name": "Scheduled", "color": "blue"},
                                        {"name": "Manual", "color": "green"},
                                        {"name": "Chat", "color": "purple"},
                                    ]
                                }
                            },
                        },
                    },
                )
                if resp.status_code == 200:
                    db_data = resp.json()
                    db_id = db_data["id"]
                    self._agent_dbs[agent_name] = db_id
                    self._save_agent_dbs()
                    logger.info(f"Created Notion database '{db_title}' for agent {agent_name}")
                    return db_id
                else:
                    logger.error(f"Failed to create Notion DB for {agent_name}: {resp.status_code} {resp.text[:200]}")
                    return None
        except Exception as e:
            logger.error(f"Error creating Notion DB for {agent_name}: {e}")
            return None

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

    # --- Report Publishing ---

    @staticmethod
    def _markdown_to_notion_blocks(text: str) -> List[dict]:
        """Convert markdown text to Notion block objects."""
        import re
        blocks = []
        lines = text.split("\n")
        i = 0
        while i < len(lines):
            line = lines[i].rstrip()

            # Skip empty lines
            if not line:
                i += 1
                continue

            # Headings
            if line.startswith("### "):
                blocks.append({
                    "object": "block", "type": "heading_3",
                    "heading_3": {"rich_text": [{"type": "text", "text": {"content": line[4:].strip()}}]}
                })
            elif line.startswith("## "):
                blocks.append({
                    "object": "block", "type": "heading_2",
                    "heading_2": {"rich_text": [{"type": "text", "text": {"content": line[3:].strip()}}]}
                })
            elif line.startswith("# "):
                blocks.append({
                    "object": "block", "type": "heading_1",
                    "heading_1": {"rich_text": [{"type": "text", "text": {"content": line[2:].strip()}}]}
                })
            # Horizontal rule
            elif line.strip() in ("---", "***", "___"):
                blocks.append({"object": "block", "type": "divider", "divider": {}})
            # Bullet list
            elif line.lstrip().startswith(("- ", "* ", "+ ")):
                indent = len(line) - len(line.lstrip())
                content = line.lstrip()[2:].strip()
                rich_text = NotionBridge._text_to_rich_text(content)
                blocks.append({
                    "object": "block", "type": "bulleted_list_item",
                    "bulleted_list_item": {"rich_text": rich_text}
                })
            # Numbered list
            elif re.match(r'^\d+\.\s', line.lstrip()):
                content = re.sub(r'^\d+\.\s', '', line.lstrip()).strip()
                rich_text = NotionBridge._text_to_rich_text(content)
                blocks.append({
                    "object": "block", "type": "numbered_list_item",
                    "numbered_list_item": {"rich_text": rich_text}
                })
            # Regular paragraph
            else:
                rich_text = NotionBridge._text_to_rich_text(line)
                blocks.append({
                    "object": "block", "type": "paragraph",
                    "paragraph": {"rich_text": rich_text}
                })

            i += 1

        # Notion API limits 100 blocks per request (reserve 1 for metadata callout)
        return blocks[:99]

    @staticmethod
    def _text_to_rich_text(text: str) -> List[dict]:
        """Convert text with **bold** and *italic* markers to Notion rich_text array."""
        import re
        # Truncate to Notion's 2000 char limit per rich_text block
        text = text[:2000]
        parts = []
        pos = 0
        for match in re.finditer(r'\*\*(.+?)\*\*|\*(.+?)\*', text):
            if match.start() > pos:
                parts.append({"type": "text", "text": {"content": text[pos:match.start()]}})
            if match.group(1):
                parts.append({"type": "text", "text": {"content": match.group(1)}, "annotations": {"bold": True}})
            elif match.group(2):
                parts.append({"type": "text", "text": {"content": match.group(2)}, "annotations": {"italic": True}})
            pos = match.end()
        if pos < len(text):
            parts.append({"type": "text", "text": {"content": text[pos:]}})
        if not parts:
            parts.append({"type": "text", "text": {"content": text}})
        return parts

    async def publish_report(
        self,
        title: str,
        content: str,
        agent_name: str = "",
        report_type: str = "",
        source: str = "scheduled",
    ) -> Optional[str]:
        """Publish a report into the agent's Notion database. Returns the page URL or None."""
        if not self.configured:
            return None
        try:
            # Get or create per-agent database
            db_id = await self._get_or_create_agent_db(agent_name or "General")

            # Choose emoji based on report type
            page_emoji = REPORT_TYPE_EMOJIS.get(report_type, "📄")

            # Format type label for database property
            type_labels = {
                "briefing": "Briefing", "content": "Content", "tech_report": "Tech Report",
                "outreach": "Outreach", "weekly_review": "Weekly Review",
                "content_calendar": "Content Calendar",
            }
            type_label = type_labels.get(report_type, report_type.replace("_", " ").title() if report_type else "Report")
            source_label = source.capitalize() if source else "Manual"

            # Convert content to Notion blocks
            content_blocks = self._markdown_to_notion_blocks(content)

            # Build page data
            if db_id:
                # Publish into agent's database
                page_data = {
                    "parent": {"database_id": db_id},
                    "icon": {"type": "emoji", "emoji": page_emoji},
                    "properties": {
                        "Title": {"title": [{"text": {"content": title}}]},
                        "Type": {"select": {"name": type_label}},
                        "Date": {"date": {"start": datetime.now().strftime("%Y-%m-%d")}},
                        "Source": {"select": {"name": source_label}},
                    },
                    "children": content_blocks,
                }
            else:
                # Fallback: publish as child page of connected page
                page_data = {
                    "parent": {"page_id": self.database_id},
                    "icon": {"type": "emoji", "emoji": page_emoji},
                    "properties": {
                        "title": {"title": [{"text": {"content": title}}]}
                    },
                    "children": content_blocks,
                }

            async with httpx.AsyncClient(timeout=30.0) as client:
                resp = await client.post(
                    f"{self.BASE_URL}/pages",
                    headers=self._headers(),
                    json=page_data,
                )
                if resp.status_code == 200:
                    result = resp.json()
                    page_url = result.get("url", "")
                    logger.info(f"Published to Notion [{agent_name}]: {title} → {page_url}")
                    return page_url
                else:
                    logger.error(f"Notion publish failed: {resp.status_code} {resp.text[:300]}")
                    return None
        except Exception as e:
            logger.error(f"Notion publish error: {e}")
            return None

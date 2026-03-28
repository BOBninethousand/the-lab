import httpx
import json
import os
import logging
from datetime import datetime, timezone
from typing import Optional, List, Dict, Any
from app.config import settings

logger = logging.getLogger(__name__)

NOTION_VERSION = "2022-06-28"

AGENT_EMOJIS = {
    "Scout": "🔍",
    "Quill": "✍️",
    "Forge": "⚒️",
    "Radar": "📡",
    "Atlas": "🌐",
    "Zeus": "⚡",
    "Master Chat": "🤖",
    "Dr Bob": "🩺",
    "Agent Bob": "💊",
    "Agent Alice": "🧬",
    "Agent Charlie": "📊",
    "Agent Diana": "🫀",
    "Agent Echo": "🔬",
}

REPORT_TYPE_EMOJIS = {
    "briefing": "📋",
    "content": "📝",
    "tech_report": "⚙️",
    "outreach": "📧",
    "weekly_review": "📊",
    "content_calendar": "📅",
    "health_check": "🏥",
    "longevity_check": "🧬",
    "hdl_audit": "🩺",
    "credit_report": "💳",
    "weekly_digest": "📰",
    "research": "🔬",
    "scheduled": "📄",
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
        # Publish stats (in-memory, resets on restart)
        self._publish_successes = 0
        self._publish_failures = 0
        self._last_publish_error: Optional[str] = None

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

    async def validate_agent_dbs(self):
        """Check each cached database ID is still accessible. Remove stale entries."""
        if not self.configured or not self._agent_dbs:
            return
        logger.info(f"Validating {len(self._agent_dbs)} cached Notion agent databases...")
        stale = []
        async with httpx.AsyncClient(timeout=15.0) as client:
            for agent_name, db_id in self._agent_dbs.items():
                try:
                    resp = await client.get(
                        f"{self.BASE_URL}/databases/{db_id}",
                        headers=self._headers(),
                    )
                    if resp.status_code != 200:
                        logger.warning(f"Stale Notion DB for '{agent_name}' (id={db_id[:12]}…): {resp.status_code}")
                        stale.append(agent_name)
                except Exception as e:
                    logger.warning(f"Cannot reach Notion DB for '{agent_name}': {e}")
                    stale.append(agent_name)
        if stale:
            for name in stale:
                del self._agent_dbs[name]
            self._save_agent_dbs()
            logger.info(f"Evicted {len(stale)} stale agent DB entries: {stale}")
        else:
            logger.info("All cached Notion agent databases are valid")

    def get_publish_stats(self) -> dict:
        return {
            "successes": self._publish_successes,
            "failures": self._publish_failures,
            "last_error": self._last_publish_error,
        }

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
        self.last_sync = datetime.now(timezone.utc).isoformat()
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
        self.last_sync = datetime.now(timezone.utc).isoformat()
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

    async def create_task(
        self,
        title: str,
        agent_name: str = "",
        priority: str = "Medium",
        project: str = "",
        handoff_notes: str = "",
        source: str = "Master Chat",
    ) -> Optional[dict]:
        """Create a task in the Notion Agent Ops database. Returns normalized task dict or None."""
        if not self.configured:
            return None
        try:
            properties = {
                "Task": {"title": [{"text": {"content": title}}]},
                "Status": {"select": {"name": "New"}},
                "Priority": {"select": {"name": priority}},
                "Source": {"select": {"name": source}},
            }
            if agent_name:
                properties["Agent"] = {"select": {"name": agent_name}}
            if project:
                properties["Project"] = {"select": {"name": project}}
            if handoff_notes:
                properties["Handoff Notes"] = {
                    "rich_text": [{"text": {"content": handoff_notes}}]
                }

            async with httpx.AsyncClient(timeout=30.0) as client:
                resp = await client.post(
                    f"{self.BASE_URL}/pages",
                    headers=self._headers(),
                    json={
                        "parent": {"database_id": self.database_id},
                        "properties": properties,
                    },
                )
                if resp.status_code == 200:
                    page = resp.json()
                    task = self._normalize_task(page)
                    logger.info(f"Created Notion task: {title} → {page.get('url', '')}")
                    return task
                else:
                    logger.error(f"Notion create_task failed: {resp.status_code} {resp.text[:300]}")
                    return None
        except Exception as e:
            logger.error(f"Notion create_task error: {e}")
            return None

    # --- Report Publishing ---

    @staticmethod
    def _markdown_to_notion_blocks(text: str) -> List[dict]:
        """Convert markdown text to Notion block objects."""
        import re
        blocks = []
        lines = text.split("\n")
        i = 0
        in_code_block = False
        code_lines = []
        code_language = ""

        while i < len(lines):
            line = lines[i].rstrip()

            # Fenced code blocks
            if line.lstrip().startswith("```"):
                if not in_code_block:
                    in_code_block = True
                    code_language = line.lstrip()[3:].strip() or "plain text"
                    code_lines = []
                else:
                    in_code_block = False
                    blocks.append({
                        "object": "block", "type": "code",
                        "code": {
                            "rich_text": [{"type": "text", "text": {"content": NotionBridge._smart_truncate("\n".join(code_lines))}}],
                            "language": code_language,
                        }
                    })
                i += 1
                continue

            if in_code_block:
                code_lines.append(lines[i].rstrip())
                i += 1
                continue

            # Empty lines — preserve as spacing
            if not line:
                blocks.append({
                    "object": "block", "type": "paragraph",
                    "paragraph": {"rich_text": []}
                })
                i += 1
                continue

            # Headings (with rich text parsing)
            if line.startswith("### "):
                blocks.append({
                    "object": "block", "type": "heading_3",
                    "heading_3": {"rich_text": NotionBridge._text_to_rich_text(line[4:].strip())}
                })
            elif line.startswith("## "):
                blocks.append({
                    "object": "block", "type": "heading_2",
                    "heading_2": {"rich_text": NotionBridge._text_to_rich_text(line[3:].strip())}
                })
            elif line.startswith("# "):
                blocks.append({
                    "object": "block", "type": "heading_1",
                    "heading_1": {"rich_text": NotionBridge._text_to_rich_text(line[2:].strip())}
                })
            # Horizontal rule
            elif line.strip() in ("---", "***", "___"):
                blocks.append({"object": "block", "type": "divider", "divider": {}})
            # Blockquote
            elif line.lstrip().startswith("> "):
                content = line.lstrip()[2:].strip()
                rich_text = NotionBridge._text_to_rich_text(content)
                blocks.append({
                    "object": "block", "type": "quote",
                    "quote": {"rich_text": rich_text}
                })
            # Bullet list
            elif line.lstrip().startswith(("- ", "* ", "+ ")):
                indent = len(line) - len(line.lstrip())
                content = line.lstrip()[2:].strip()
                rich_text = NotionBridge._text_to_rich_text(content)
                block = {
                    "object": "block", "type": "bulleted_list_item",
                    "bulleted_list_item": {"rich_text": rich_text}
                }
                # Nested list — attach as child of previous list item
                if indent > 0 and blocks and blocks[-1].get("type") == "bulleted_list_item":
                    parent = blocks[-1]["bulleted_list_item"]
                    parent.setdefault("children", []).append(block)
                else:
                    blocks.append(block)
            # Numbered list
            elif re.match(r'^\s*\d+\.\s', line):
                indent = len(line) - len(line.lstrip())
                content = re.sub(r'^\d+\.\s', '', line.lstrip()).strip()
                rich_text = NotionBridge._text_to_rich_text(content)
                block = {
                    "object": "block", "type": "numbered_list_item",
                    "numbered_list_item": {"rich_text": rich_text}
                }
                if indent > 0 and blocks and blocks[-1].get("type") == "numbered_list_item":
                    parent = blocks[-1]["numbered_list_item"]
                    parent.setdefault("children", []).append(block)
                else:
                    blocks.append(block)
            # Regular paragraph
            else:
                rich_text = NotionBridge._text_to_rich_text(line)
                blocks.append({
                    "object": "block", "type": "paragraph",
                    "paragraph": {"rich_text": rich_text}
                })

            i += 1

        return blocks

    @staticmethod
    def _smart_truncate(text: str, limit: int = 2000) -> str:
        """Truncate text at word boundary within limit."""
        if len(text) <= limit:
            return text
        truncated = text[:limit]
        last_space = truncated.rfind(" ")
        if last_space > limit * 0.8:
            return truncated[:last_space]
        return truncated

    @staticmethod
    def _text_to_rich_text(text: str) -> List[dict]:
        """Convert text with **bold**, *italic*, `code`, [links](url) to Notion rich_text array."""
        import re
        text = NotionBridge._smart_truncate(text)
        parts = []
        pos = 0
        pattern = re.compile(
            r'\*\*\*(.+?)\*\*\*'   # ***bold+italic***
            r'|\*\*(.+?)\*\*'      # **bold**
            r'|\*(.+?)\*'          # *italic*
            r'|`([^`]+)`'          # `code`
            r'|\[([^\]]+)\]\(([^)]+)\)'  # [text](url)
        )
        for match in pattern.finditer(text):
            if match.start() > pos:
                parts.append({"type": "text", "text": {"content": text[pos:match.start()]}})
            if match.group(1):
                parts.append({"type": "text", "text": {"content": match.group(1)}, "annotations": {"bold": True, "italic": True}})
            elif match.group(2):
                parts.append({"type": "text", "text": {"content": match.group(2)}, "annotations": {"bold": True}})
            elif match.group(3):
                parts.append({"type": "text", "text": {"content": match.group(3)}, "annotations": {"italic": True}})
            elif match.group(4):
                parts.append({"type": "text", "text": {"content": match.group(4)}, "annotations": {"code": True}})
            elif match.group(5):
                parts.append({"type": "text", "text": {"content": match.group(5), "link": {"url": match.group(6)}}})
            pos = match.end()
        if pos < len(text):
            parts.append({"type": "text", "text": {"content": text[pos:]}})
        if not parts:
            parts.append({"type": "text", "text": {"content": text}})
        return parts

    async def _append_blocks(self, page_id: str, blocks: List[dict]) -> bool:
        """Append blocks to an existing page in batches of 100."""
        for start in range(0, len(blocks), 100):
            batch = blocks[start:start + 100]
            try:
                async with httpx.AsyncClient(timeout=30.0) as client:
                    resp = await client.patch(
                        f"{self.BASE_URL}/blocks/{page_id}/children",
                        headers=self._headers(),
                        json={"children": batch},
                    )
                    if resp.status_code != 200:
                        logger.error(f"Notion append blocks failed: {resp.status_code} {resp.text[:300]}")
                        return False
            except Exception as e:
                logger.error(f"Notion append blocks error: {e}")
                return False
        return True

    def _build_page_data(self, db_id, page_emoji, dated_title, type_label, source_label, initial_blocks, now):
        """Build the Notion page creation payload."""
        if db_id:
            return {
                "parent": {"database_id": db_id},
                "icon": {"type": "emoji", "emoji": page_emoji},
                "properties": {
                    "Title": {"title": [{"text": {"content": dated_title}}]},
                    "Type": {"select": {"name": type_label}},
                    "Date": {"date": {"start": now.strftime("%Y-%m-%d")}},
                    "Source": {"select": {"name": source_label}},
                },
                "children": initial_blocks,
            }
        return {
            "parent": {"page_id": self.database_id},
            "icon": {"type": "emoji", "emoji": page_emoji},
            "properties": {
                "title": {"title": [{"text": {"content": dated_title}}]}
            },
            "children": initial_blocks,
        }

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
            now = datetime.now(timezone.utc)
            agent_icon = AGENT_EMOJIS.get(agent_name, "📋")
            dated_title = f"{agent_icon} {title} — {now.strftime('%d %b')}"

            resolved_name = agent_name or "General"
            db_id = await self._get_or_create_agent_db(resolved_name)
            page_emoji = REPORT_TYPE_EMOJIS.get(report_type, "📄")

            type_labels = {
                "briefing": "Briefing", "content": "Content", "tech_report": "Tech Report",
                "outreach": "Outreach", "weekly_review": "Weekly Review",
                "content_calendar": "Content Calendar",
            }
            type_label = type_labels.get(report_type, report_type.replace("_", " ").title() if report_type else "Report")
            source_label = source.capitalize() if source else "Manual"

            # Metadata header blocks
            header_blocks = [
                {
                    "object": "block", "type": "callout",
                    "callout": {
                        "rich_text": [{"type": "text", "text": {"content": f"Report by {agent_name or 'General'} | {now.strftime('%d %b %Y %H:%M UTC')} | {type_label}"}}],
                        "icon": {"type": "emoji", "emoji": agent_icon},
                    }
                },
                {"object": "block", "type": "divider", "divider": {}},
            ]

            content_blocks = self._markdown_to_notion_blocks(content)
            all_blocks = header_blocks + content_blocks
            initial_blocks = all_blocks[:100]
            overflow_blocks = all_blocks[100:]

            page_data = self._build_page_data(db_id, page_emoji, dated_title, type_label, source_label, initial_blocks, now)

            async with httpx.AsyncClient(timeout=30.0) as client:
                resp = await client.post(
                    f"{self.BASE_URL}/pages",
                    headers=self._headers(),
                    json=page_data,
                )

                # Retry once if stale cache (404/400 on database)
                if resp.status_code in (400, 404) and db_id and resolved_name in self._agent_dbs:
                    logger.warning(f"Stale Notion DB for '{resolved_name}' — evicting cache and retrying")
                    del self._agent_dbs[resolved_name]
                    self._save_agent_dbs()
                    db_id = await self._get_or_create_agent_db(resolved_name)
                    page_data = self._build_page_data(db_id, page_emoji, dated_title, type_label, source_label, initial_blocks, now)
                    resp = await client.post(
                        f"{self.BASE_URL}/pages",
                        headers=self._headers(),
                        json=page_data,
                    )

                if resp.status_code == 200:
                    result = resp.json()
                    page_id = result["id"]
                    page_url = result.get("url", "")

                    if overflow_blocks:
                        await self._append_blocks(page_id, overflow_blocks)

                    self._publish_successes += 1
                    logger.info(f"Published to Notion [{agent_name}]: {title} → {page_url}")
                    return page_url
                else:
                    self._publish_failures += 1
                    self._last_publish_error = f"[{agent_name}] {resp.status_code}: {resp.text[:200]}"
                    logger.error(f"Notion publish failed: {resp.status_code} {resp.text[:300]}")
                    return None
        except Exception as e:
            self._publish_failures += 1
            self._last_publish_error = f"[{agent_name}] {e}"
            logger.error(f"Notion publish error: {e}")
            return None

import json
import os
import uuid
import asyncio
import logging
from datetime import datetime, timezone
from typing import Optional, List, Dict, Any
from app.config import settings
from app.models import (
    KnowledgeCreate, KnowledgeEntry,
    AgentMemoryEntry,
    CorrectionCreate, CorrectionEntry,
    MemoryStats,
)
from app.embeddings import EmbeddingManager

logger = logging.getLogger(__name__)


class KnowledgeBaseManager:
    def __init__(self, embedding_manager: EmbeddingManager):
        self.dir = f"{settings.DATA_DIR}/knowledge"
        self.embedding = embedding_manager
        os.makedirs(self.dir, exist_ok=True)

    async def add(self, data: KnowledgeCreate) -> KnowledgeEntry:
        now = datetime.now(timezone.utc)
        embedding = await self.embedding.embed_text(f"{data.title} {data.content}")
        entry = KnowledgeEntry(
            id=str(uuid.uuid4()),
            title=data.title,
            content=data.content,
            tags=data.tags,
            category=data.category,
            source="manual",
            notion_page_id=data.notion_page_id,
            embedding=embedding,
            created_at=now,
            updated_at=now,
        )
        self._save(entry)
        return entry

    def _save(self, entry: KnowledgeEntry):
        path = f"{self.dir}/{entry.id}.json"
        with open(path, "w") as f:
            json.dump(entry.model_dump(mode="json"), f, indent=2)

    def get(self, entry_id: str) -> Optional[KnowledgeEntry]:
        path = f"{self.dir}/{entry_id}.json"
        if not os.path.exists(path):
            return None
        with open(path, "r") as f:
            return KnowledgeEntry(**json.load(f))

    def get_all(
        self,
        category: Optional[str] = None,
        tag: Optional[str] = None,
        search: Optional[str] = None,
    ) -> List[KnowledgeEntry]:
        entries = []
        for fn in os.listdir(self.dir):
            if not fn.endswith(".json"):
                continue
            try:
                with open(f"{self.dir}/{fn}", "r") as f:
                    entry = KnowledgeEntry(**json.load(f))
                if category and entry.category != category:
                    continue
                if tag and tag not in entry.tags:
                    continue
                if search and search.lower() not in f"{entry.title} {entry.content}".lower():
                    continue
                entries.append(entry)
            except Exception:
                continue
        entries.sort(key=lambda e: e.created_at, reverse=True)
        return entries

    async def search_semantic(self, query: str, top_k: int = 5) -> List[KnowledgeEntry]:
        all_entries = self.get_all()
        corpus = [e.model_dump(mode="json") for e in all_entries]
        results = await self.embedding.search(query, corpus, top_k=top_k, threshold=0.3)
        return [KnowledgeEntry(**r) for r in results]

    async def update(self, entry_id: str, data: dict) -> Optional[KnowledgeEntry]:
        entry = self.get(entry_id)
        if not entry:
            return None
        for key, val in data.items():
            if key in ("title", "content", "tags", "category", "notion_page_id") and val is not None:
                setattr(entry, key, val)
        entry.updated_at = datetime.now(timezone.utc)
        if "title" in data or "content" in data:
            entry.embedding = await self.embedding.embed_text(f"{entry.title} {entry.content}")
        self._save(entry)
        return entry

    def delete(self, entry_id: str) -> bool:
        path = f"{self.dir}/{entry_id}.json"
        if os.path.exists(path):
            os.remove(path)
            return True
        return False

    def count(self) -> int:
        return len([f for f in os.listdir(self.dir) if f.endswith(".json")])


class AgentMemoryManager:
    def __init__(self, embedding_manager: EmbeddingManager):
        self.base_dir = f"{settings.DATA_DIR}/agent_memory"
        self.embedding = embedding_manager
        os.makedirs(self.base_dir, exist_ok=True)

    def _agent_dir(self, agent_id: str) -> str:
        d = f"{self.base_dir}/{agent_id}"
        os.makedirs(d, exist_ok=True)
        return d

    async def add(
        self,
        agent_id: str,
        content: str,
        memory_type: str = "insight",
        tags: Optional[List[str]] = None,
        source_chat_id: Optional[str] = None,
    ) -> AgentMemoryEntry:
        embedding = await self.embedding.embed_text(content)

        # Deduplication: skip if a very similar memory already exists
        if embedding:
            existing = self.get_for_agent(agent_id)
            for mem in existing:
                if mem.embedding:
                    sim = self.embedding.cosine_similarity(embedding, mem.embedding)
                    if sim > 0.85:
                        logger.debug(f"Skipping duplicate memory for {agent_id}: {content[:60]}...")
                        return mem

        entry = AgentMemoryEntry(
            id=str(uuid.uuid4()),
            agent_id=agent_id,
            content=content,
            memory_type=memory_type,
            tags=tags or [],
            embedding=embedding,
            source_chat_id=source_chat_id,
            created_at=datetime.now(timezone.utc),
        )
        path = f"{self._agent_dir(agent_id)}/{entry.id}.json"
        with open(path, "w") as f:
            json.dump(entry.model_dump(mode="json"), f, indent=2)
        return entry

    def get_for_agent(self, agent_id: str) -> List[AgentMemoryEntry]:
        d = self._agent_dir(agent_id)
        entries = []
        for fn in os.listdir(d):
            if not fn.endswith(".json"):
                continue
            try:
                with open(f"{d}/{fn}", "r") as f:
                    entries.append(AgentMemoryEntry(**json.load(f)))
            except Exception:
                continue
        entries.sort(key=lambda e: e.created_at, reverse=True)
        return entries

    async def search_for_agent(
        self, agent_id: str, query: str, top_k: int = 5
    ) -> List[AgentMemoryEntry]:
        all_entries = self.get_for_agent(agent_id)
        corpus = [e.model_dump(mode="json") for e in all_entries]
        results = await self.embedding.search(query, corpus, top_k=top_k, threshold=0.3)
        return [AgentMemoryEntry(**r) for r in results]

    def delete(self, agent_id: str, memory_id: str) -> bool:
        path = f"{self._agent_dir(agent_id)}/{memory_id}.json"
        if os.path.exists(path):
            os.remove(path)
            return True
        return False

    def count(self, agent_id: Optional[str] = None) -> int:
        if agent_id:
            d = self._agent_dir(agent_id)
            return len([f for f in os.listdir(d) if f.endswith(".json")])
        total = 0
        if not os.path.exists(self.base_dir):
            return 0
        for agent_dir in os.listdir(self.base_dir):
            agent_path = f"{self.base_dir}/{agent_dir}"
            if os.path.isdir(agent_path):
                total += len([f for f in os.listdir(agent_path) if f.endswith(".json")])
        return total

    def agents_with_memory(self) -> List[str]:
        if not os.path.exists(self.base_dir):
            return []
        return [
            d for d in os.listdir(self.base_dir)
            if os.path.isdir(f"{self.base_dir}/{d}")
            and any(f.endswith(".json") for f in os.listdir(f"{self.base_dir}/{d}"))
        ]

    async def extract_from_chat(
        self, agent_id: str, user_msg: str, assistant_msg: str, llm_func=None
    ):
        """Auto-extract memories from a chat exchange. Runs as background task."""
        try:
            if llm_func is None:
                return

            prompt = (
                "Extract key facts, decisions, preferences, or learnings from this conversation.\n"
                "Return ONLY a JSON array. Each item: {\"content\": \"...\", \"type\": \"insight|learning|preference|fact\", \"tags\": [...]}\n"
                "If nothing worth remembering, return [].\n\n"
                f"User: {user_msg[:500]}\n\nAssistant: {assistant_msg[:500]}"
            )

            response_text = await llm_func(prompt)
            if not response_text:
                return

            # Parse JSON from response
            import re
            json_match = re.search(r'\[.*\]', response_text, re.DOTALL)
            if not json_match:
                return

            items = json.loads(json_match.group())
            if not isinstance(items, list):
                return

            for item in items[:5]:  # Max 5 memories per chat
                content = item.get("content", "").strip()
                if not content or len(content) < 10:
                    continue
                memory_type = item.get("type", "insight")
                if memory_type not in ("insight", "learning", "preference", "fact"):
                    memory_type = "insight"
                tags = item.get("tags", [])
                if not isinstance(tags, list):
                    tags = []
                await self.add(agent_id, content, memory_type, tags[:5])

            logger.info(f"Extracted {len(items)} memories for agent {agent_id}")
        except Exception as e:
            logger.warning(f"Memory extraction failed for agent {agent_id}: {e}")

    async def extract_from_report(
        self, agent_id: str, report_content: str, report_type: str, agent_name: str, llm_func=None
    ):
        """Extract key learnings from a completed report and save as agent memories."""
        try:
            if llm_func is None:
                return

            prompt = (
                f"You are reviewing a {report_type} report by {agent_name}. "
                f"Extract 3-5 key facts, findings, or actionable insights that should be remembered for future reports. "
                f"Focus on: specific data points, company names, market trends, decisions made, or recommendations given.\n\n"
                f"Report content:\n{report_content[:2000]}\n\n"
                f"Return ONLY a JSON array: [{{\"content\": \"...\", \"type\": \"insight|learning|fact\", \"tags\": [...]}}]\n"
                f"If nothing new worth remembering, return []."
            )

            response_text = await llm_func(prompt)
            if not response_text:
                return

            import re
            json_match = re.search(r'\[.*\]', response_text, re.DOTALL)
            if not json_match:
                return

            items = json.loads(json_match.group())
            if not isinstance(items, list):
                return

            saved = 0
            for item in items[:5]:
                content = item.get("content", "").strip()
                if not content or len(content) < 10:
                    continue
                memory_type = item.get("type", "insight")
                if memory_type not in ("insight", "learning", "preference", "fact"):
                    memory_type = "insight"
                tags = item.get("tags", [])
                if not isinstance(tags, list):
                    tags = []
                tags.append(report_type)
                await self.add(agent_id, content, memory_type, tags[:5])
                saved += 1

            logger.info(f"Extracted {saved} learnings from {agent_name}'s {report_type} report")
        except Exception as e:
            logger.warning(f"Report learning extraction failed for {agent_name}: {e}")


class CorrectionManager:
    def __init__(self, embedding_manager: EmbeddingManager, knowledge_manager: KnowledgeBaseManager):
        self.base_dir = f"{settings.DATA_DIR}/corrections"
        self.embedding = embedding_manager
        self.knowledge = knowledge_manager
        os.makedirs(self.base_dir, exist_ok=True)

    def _agent_dir(self, agent_id: str) -> str:
        d = f"{self.base_dir}/{agent_id}"
        os.makedirs(d, exist_ok=True)
        return d

    async def add(self, data: CorrectionCreate) -> CorrectionEntry:
        embedding = await self.embedding.embed_text(data.correction)

        # Check for similar existing correction (pattern detection)
        existing = self.get_for_agent(data.agent_id)
        matched = await self._find_similar(data.correction, existing, threshold=0.85)

        if matched:
            matched.occurrence_count += 1
            if matched.occurrence_count >= 2 and not matched.rule_created:
                await self._promote_to_rule(matched)
                matched.rule_created = True
            self._save(matched)
            return matched

        entry = CorrectionEntry(
            id=str(uuid.uuid4()),
            agent_id=data.agent_id,
            original_response=data.original_response,
            correction=data.correction,
            embedding=embedding,
            tags=data.tags,
            created_at=datetime.now(timezone.utc),
        )
        self._save(entry)
        return entry

    async def _find_similar(
        self, text: str, corrections: List[CorrectionEntry], threshold: float
    ) -> Optional[CorrectionEntry]:
        text_emb = await self.embedding.embed_text(text)
        if not text_emb:
            return None
        for c in corrections:
            if c.embedding:
                sim = self.embedding.cosine_similarity(text_emb, c.embedding)
                if sim >= threshold:
                    return c
        return None

    async def _promote_to_rule(self, correction: CorrectionEntry):
        """Auto-create a knowledge base rule from a repeated correction."""
        await self.knowledge.add(KnowledgeCreate(
            title=f"Rule: {correction.correction[:80]}",
            content=f"CORRECTION RULE (auto-generated from repeated feedback):\n\n{correction.correction}\n\nOriginal issue: {correction.original_response[:200]}",
            tags=correction.tags + ["auto-rule"],
            category="rule",
        ))
        logger.info(f"Promoted correction to rule for agent {correction.agent_id}")

    def _save(self, entry: CorrectionEntry):
        path = f"{self._agent_dir(entry.agent_id)}/{entry.id}.json"
        with open(path, "w") as f:
            json.dump(entry.model_dump(mode="json"), f, indent=2)

    def get_for_agent(self, agent_id: str) -> List[CorrectionEntry]:
        d = self._agent_dir(agent_id)
        entries = []
        for fn in os.listdir(d):
            if not fn.endswith(".json"):
                continue
            try:
                with open(f"{d}/{fn}", "r") as f:
                    entries.append(CorrectionEntry(**json.load(f)))
            except Exception:
                continue
        entries.sort(key=lambda e: e.created_at, reverse=True)
        return entries

    def get_rules(self, agent_id: str) -> List[CorrectionEntry]:
        return [c for c in self.get_for_agent(agent_id) if c.occurrence_count >= 2]

    def count(self, agent_id: Optional[str] = None) -> int:
        if agent_id:
            d = self._agent_dir(agent_id)
            return len([f for f in os.listdir(d) if f.endswith(".json")])
        total = 0
        if not os.path.exists(self.base_dir):
            return 0
        for agent_dir in os.listdir(self.base_dir):
            agent_path = f"{self.base_dir}/{agent_dir}"
            if os.path.isdir(agent_path):
                total += len([f for f in os.listdir(agent_path) if f.endswith(".json")])
        return total

    def rules_count(self) -> int:
        total = 0
        if not os.path.exists(self.base_dir):
            return 0
        for agent_dir in os.listdir(self.base_dir):
            agent_path = f"{self.base_dir}/{agent_dir}"
            if not os.path.isdir(agent_path):
                continue
            for fn in os.listdir(agent_path):
                if not fn.endswith(".json"):
                    continue
                try:
                    with open(f"{agent_path}/{fn}", "r") as f:
                        data = json.load(f)
                        if data.get("occurrence_count", 0) >= 2:
                            total += 1
                except Exception:
                    continue
        return total


async def build_context(
    agent_id: str,
    user_message: str,
    knowledge_mgr: KnowledgeBaseManager,
    agent_memory_mgr: AgentMemoryManager,
    correction_mgr: CorrectionManager,
    max_tokens: int = 2000,
) -> str:
    """Build contextual memory block for injection into agent system prompt."""
    sections = []

    # 1. Search knowledge base
    try:
        knowledge_results = await knowledge_mgr.search_semantic(user_message, top_k=3)
        if knowledge_results:
            items = []
            for k in knowledge_results:
                items.append(f"- [{k.category.upper()}] {k.title}: {k.content[:200]}")
            sections.append("## Relevant Knowledge\n" + "\n".join(items))
    except Exception as e:
        logger.warning(f"Knowledge search failed: {e}")

    # 2. Search agent-specific memories
    try:
        agent_memories = await agent_memory_mgr.search_for_agent(agent_id, user_message, top_k=3)
        if agent_memories:
            items = [f"- [{m.memory_type}] {m.content[:200]}" for m in agent_memories]
            sections.append("## Your Past Learnings\n" + "\n".join(items))
    except Exception as e:
        logger.warning(f"Agent memory search failed: {e}")

    # 3. Get active correction rules (always include — these are critical)
    try:
        rules = correction_mgr.get_rules(agent_id)
        if rules:
            items = [f"- {r.correction[:200]}" for r in rules]
            sections.append("## Correction Rules (MUST follow these)\n" + "\n".join(items))
    except Exception as e:
        logger.warning(f"Correction rules fetch failed: {e}")

    if not sections:
        return ""

    context = "<memory_context>\n" + "\n\n".join(sections) + "\n</memory_context>"

    # Rough token estimate (1 token ~ 4 chars) — trim if over budget
    if len(context) > max_tokens * 4:
        context = context[: max_tokens * 4] + "\n</memory_context>"

    return context


def get_memory_stats(
    knowledge_mgr: KnowledgeBaseManager,
    agent_memory_mgr: AgentMemoryManager,
    correction_mgr: CorrectionManager,
) -> MemoryStats:
    return MemoryStats(
        knowledge_count=knowledge_mgr.count(),
        agent_memory_count=agent_memory_mgr.count(),
        correction_count=correction_mgr.count(),
        rules_count=correction_mgr.rules_count(),
        agents_with_memory=agent_memory_mgr.agents_with_memory(),
    )

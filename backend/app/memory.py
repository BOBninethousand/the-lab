import json
import os
import uuid
from datetime import datetime
from typing import Optional, List
from app.config import settings
from app.models import MemoryEntry, MemoryCreate, JournalEntry, JournalCreate


class MemoryManager:
    def __init__(self):
        self.memories_dir = f"{settings.DATA_DIR}/memories"
        self.journals_dir = f"{settings.DATA_DIR}/journals"
        os.makedirs(self.memories_dir, exist_ok=True)
        os.makedirs(self.journals_dir, exist_ok=True)

    def add_memory(self, data: MemoryCreate) -> MemoryEntry:
        memory = MemoryEntry(
            id=str(uuid.uuid4()),
            date=datetime.now().strftime("%Y-%m-%d"),
            content=data.content,
            tags=data.tags,
            source=data.source,
        )
        memory_file = f"{self.memories_dir}/{memory.id}.json"
        with open(memory_file, "w") as f:
            json.dump(memory.model_dump(mode="json"), f, indent=2)
        return memory

    def get_memories(
        self, date: Optional[str] = None, tag: Optional[str] = None, search: Optional[str] = None
    ) -> List[MemoryEntry]:
        memories = []
        if not os.path.exists(self.memories_dir):
            return memories

        for filename in os.listdir(self.memories_dir):
            if filename.endswith(".json"):
                filepath = os.path.join(self.memories_dir, filename)
                try:
                    with open(filepath, "r") as f:
                        data = json.load(f)
                        memory = MemoryEntry(**data)

                        # Filter by date
                        if date and memory.date != date:
                            continue

                        # Filter by tag
                        if tag and tag not in memory.tags:
                            continue

                        # Filter by search term
                        if search and search.lower() not in memory.content.lower():
                            continue

                        memories.append(memory)
                except:
                    continue

        # Sort by date descending
        memories.sort(key=lambda m: m.date, reverse=True)
        return memories

    def create_journal(self, data: JournalCreate) -> JournalEntry:
        today = datetime.now().strftime("%Y-%m-%d")
        journal = JournalEntry(
            id=str(uuid.uuid4()),
            date=today,
            title=data.title,
            content=data.content,
            highlights=data.highlights,
        )
        journal_file = f"{self.journals_dir}/{today}.json"

        # Load existing entries for today or create new
        entries = []
        if os.path.exists(journal_file):
            try:
                with open(journal_file, "r") as f:
                    data_list = json.load(f)
                    if isinstance(data_list, list):
                        entries = data_list
            except:
                entries = []

        entries.append(journal.model_dump(mode="json"))

        with open(journal_file, "w") as f:
            json.dump(entries, f, indent=2)

        return journal

    def get_journals(self, limit: int = 30) -> List[JournalEntry]:
        journals = []
        if not os.path.exists(self.journals_dir):
            return journals

        # Get all journal files
        journal_files = []
        for filename in os.listdir(self.journals_dir):
            if filename.endswith(".json"):
                journal_files.append(filename)

        # Sort by date descending
        journal_files.sort(reverse=True)

        for filename in journal_files[:limit]:
            filepath = os.path.join(self.journals_dir, filename)
            try:
                with open(filepath, "r") as f:
                    data_list = json.load(f)
                    if isinstance(data_list, list):
                        for entry_data in data_list:
                            journals.append(JournalEntry(**entry_data))
            except:
                continue

        return journals

    def get_journal(self, date: str) -> Optional[JournalEntry]:
        journal_file = f"{self.journals_dir}/{date}.json"
        if os.path.exists(journal_file):
            try:
                with open(journal_file, "r") as f:
                    data_list = json.load(f)
                    if isinstance(data_list, list) and len(data_list) > 0:
                        return JournalEntry(**data_list[0])
            except:
                pass
        return None

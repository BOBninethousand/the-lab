import json
import os
import uuid
from datetime import datetime
from typing import Optional, List
from app.config import settings
from app.models import Document, DocumentCreate


class DocumentManager:
    def __init__(self):
        self.documents_dir = f"{settings.DATA_DIR}/documents"
        os.makedirs(self.documents_dir, exist_ok=True)

    def create_document(self, data: DocumentCreate) -> Document:
        document = Document(
            id=str(uuid.uuid4()),
            title=data.title,
            content=data.content,
            doc_type=data.doc_type,
            created_at=datetime.now(),
            agent_id=data.agent_id,
        )
        doc_file = f"{self.documents_dir}/{document.id}.json"
        with open(doc_file, "w") as f:
            json.dump(
                {
                    **document.model_dump(mode="json"),
                    "created_at": document.created_at.isoformat(),
                },
                f,
                indent=2,
            )
        return document

    def list_documents(self) -> List[Document]:
        documents = []
        if not os.path.exists(self.documents_dir):
            return documents

        for filename in os.listdir(self.documents_dir):
            if filename.endswith(".json"):
                filepath = os.path.join(self.documents_dir, filename)
                try:
                    with open(filepath, "r") as f:
                        data = json.load(f)
                        data["created_at"] = datetime.fromisoformat(data["created_at"])
                        documents.append(Document(**data))
                except:
                    continue

        # Sort by created_at descending
        documents.sort(key=lambda d: d.created_at, reverse=True)
        return documents

    def get_document(self, doc_id: str) -> Optional[Document]:
        doc_file = f"{self.documents_dir}/{doc_id}.json"
        if os.path.exists(doc_file):
            try:
                with open(doc_file, "r") as f:
                    data = json.load(f)
                    data["created_at"] = datetime.fromisoformat(data["created_at"])
                    return Document(**data)
            except:
                pass
        return None

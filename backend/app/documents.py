import json
import os
import uuid
from datetime import datetime
from typing import Optional, List
from app.config import settings
from app.models import Document, DocumentCreate, Report, ReportCreate


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


class ReportManager:
    def __init__(self):
        self.reports_dir = f"{settings.DATA_DIR}/reports"
        os.makedirs(self.reports_dir, exist_ok=True)

    def _save_report(self, report: Report):
        report_file = f"{self.reports_dir}/{report.id}.json"
        with open(report_file, "w") as f:
            json.dump(
                {
                    **report.model_dump(mode="json"),
                    "created_at": report.created_at.isoformat(),
                },
                f,
                indent=2,
            )

    def _load_report(self, filepath: str) -> Optional[Report]:
        try:
            with open(filepath, "r") as f:
                data = json.load(f)
                data["created_at"] = datetime.fromisoformat(data["created_at"])
                return Report(**data)
        except:
            return None

    def create_report(self, data: ReportCreate) -> Report:
        report = Report(
            id=str(uuid.uuid4()),
            title=data.title,
            content=data.content,
            report_type=data.report_type,
            agent_id=data.agent_id,
            agent_name=data.agent_name,
            source=data.source,
            starred=data.starred,
            read=False,
            created_at=datetime.now(),
        )
        self._save_report(report)
        return report

    def list_reports(
        self,
        agent_name: Optional[str] = None,
        report_type: Optional[str] = None,
        starred: Optional[bool] = None,
        search: Optional[str] = None,
        limit: int = 50,
        offset: int = 0,
    ) -> List[Report]:
        reports = []
        if not os.path.exists(self.reports_dir):
            return reports

        for filename in os.listdir(self.reports_dir):
            if filename.endswith(".json"):
                filepath = os.path.join(self.reports_dir, filename)
                report = self._load_report(filepath)
                if report:
                    reports.append(report)

        # Apply filters
        if agent_name:
            names = [n.strip().lower() for n in agent_name.split(',')]
            reports = [r for r in reports if r.agent_name.lower() in names]
        if report_type:
            reports = [r for r in reports if r.report_type == report_type]
        if starred is not None:
            reports = [r for r in reports if r.starred == starred]
        if search:
            search_lower = search.lower()
            reports = [
                r for r in reports
                if search_lower in r.title.lower() or search_lower in r.content.lower()
            ]

        # Sort newest first
        reports.sort(key=lambda r: r.created_at, reverse=True)

        # Paginate
        return reports[offset : offset + limit]

    def get_report(self, report_id: str) -> Optional[Report]:
        report_file = f"{self.reports_dir}/{report_id}.json"
        if os.path.exists(report_file):
            return self._load_report(report_file)
        return None

    def update_report(self, report_id: str, updates: dict) -> Optional[Report]:
        report = self.get_report(report_id)
        if not report:
            return None
        for key, value in updates.items():
            if hasattr(report, key) and key not in ("id", "created_at"):
                setattr(report, key, value)
        self._save_report(report)
        return report

    def delete_report(self, report_id: str) -> bool:
        report_file = f"{self.reports_dir}/{report_id}.json"
        if os.path.exists(report_file):
            os.remove(report_file)
            return True
        return False

    def get_stats(self) -> dict:
        reports = self.list_reports(limit=10000)
        today = datetime.now().date()
        by_agent = {}
        by_type = {}
        unread = 0
        today_count = 0
        for r in reports:
            by_agent[r.agent_name] = by_agent.get(r.agent_name, 0) + 1
            by_type[r.report_type] = by_type.get(r.report_type, 0) + 1
            if not r.read:
                unread += 1
            if r.created_at.date() == today:
                today_count += 1
        return {
            "total": len(reports),
            "unread": unread,
            "today": today_count,
            "by_agent": by_agent,
            "by_type": by_type,
        }

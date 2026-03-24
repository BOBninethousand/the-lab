import httpx
import logging
from typing import List, Dict, Any, Optional
from app.config import settings

logger = logging.getLogger(__name__)


class EmbeddingManager:
    def __init__(self, model: str = "nomic-embed-text"):
        self.model = model
        self.base_url = settings.OLLAMA_BASE_URL
        self._available = None

    async def _check_available(self) -> bool:
        if self._available is not None:
            return self._available
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                resp = await client.get(f"{self.base_url}/api/tags")
                self._available = resp.status_code == 200
        except Exception:
            self._available = False
            logger.warning("Ollama not reachable — embeddings disabled, falling back to keyword search")
        return self._available

    async def embed_text(self, text: str) -> Optional[List[float]]:
        if not await self._check_available():
            return None
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                resp = await client.post(
                    f"{self.base_url}/api/embed",
                    json={"model": self.model, "input": text},
                )
                if resp.status_code == 200:
                    data = resp.json()
                    embeddings = data.get("embeddings")
                    if embeddings and len(embeddings) > 0:
                        return embeddings[0]
            return None
        except Exception as e:
            logger.warning(f"Embedding failed: {e}")
            return None

    @staticmethod
    def cosine_similarity(a: List[float], b: List[float]) -> float:
        try:
            import numpy as np
            a_arr = np.array(a)
            b_arr = np.array(b)
            dot = np.dot(a_arr, b_arr)
            norm = np.linalg.norm(a_arr) * np.linalg.norm(b_arr)
            if norm == 0:
                return 0.0
            return float(dot / norm)
        except ImportError:
            # Fallback without numpy
            dot = sum(x * y for x, y in zip(a, b))
            norm_a = sum(x * x for x in a) ** 0.5
            norm_b = sum(x * x for x in b) ** 0.5
            if norm_a == 0 or norm_b == 0:
                return 0.0
            return dot / (norm_a * norm_b)

    async def search(
        self,
        query: str,
        corpus: List[Dict[str, Any]],
        top_k: int = 5,
        threshold: float = 0.0,
    ) -> List[Dict[str, Any]]:
        """Search corpus items by semantic similarity. Each item must have an 'embedding' key."""
        query_embedding = await self.embed_text(query)
        if query_embedding is None:
            return self._keyword_fallback(query, corpus, top_k)

        scored = []
        for item in corpus:
            item_emb = item.get("embedding")
            if not item_emb:
                continue
            score = self.cosine_similarity(query_embedding, item_emb)
            if score >= threshold:
                scored.append((score, item))

        scored.sort(key=lambda x: x[0], reverse=True)
        return [item for _, item in scored[:top_k]]

    @staticmethod
    def _keyword_fallback(
        query: str, corpus: List[Dict[str, Any]], top_k: int
    ) -> List[Dict[str, Any]]:
        """Simple keyword matching when embeddings are unavailable."""
        query_lower = query.lower()
        terms = query_lower.split()
        scored = []
        for item in corpus:
            content = item.get("content", "").lower()
            title = item.get("title", "").lower()
            text = f"{title} {content}"
            score = sum(1 for t in terms if t in text)
            if score > 0:
                scored.append((score, item))
        scored.sort(key=lambda x: x[0], reverse=True)
        return [item for _, item in scored[:top_k]]

    def reset_availability(self):
        """Reset cached availability check (e.g., after config change)."""
        self._available = None

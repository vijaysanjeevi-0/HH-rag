import time

import httpx
import numpy as np

import config

GEMINI_BATCH_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:batchEmbedContents"
GEMINI_MODEL = "models/gemini-embedding-001"


class Embedder:
    def __init__(self):
        self.model_name = config.EMBED_MODEL
        self._local = None
        if not config.GEMINI_API_KEY:
            from fastembed import TextEmbedding
            try:
                self._local = TextEmbedding(model_name=config.EMBED_MODEL, threads=1)
            except TypeError:
                self._local = TextEmbedding(model_name=config.EMBED_MODEL)
        else:
            self.model_name = "gemini-embedding-001"

    @property
    def provider(self):
        return "gemini" if config.GEMINI_API_KEY else "fastembed-local"

    def embed_documents(self, texts, batch_size=100, progress=False):
        vectors = []
        for start in range(0, len(texts), batch_size):
            part = texts[start:start + batch_size]
            if self._local is not None:
                vectors.extend(np.array(list(self._local.embed(part)), dtype=np.float32))
            else:
                vectors.extend(np.array(self._gemini_batch(part), dtype=np.float32))
                time.sleep(1.0)
            if progress:
                done = min(start + batch_size, len(texts))
                pct = round(100 * done / len(texts))
                bar = "#" * (pct // 5) + "." * (20 - pct // 5)
                print(f"  [{bar}] {pct}% ({done}/{len(texts)})", flush=True)
        return np.array(vectors, dtype=np.float32)

    def embed_query(self, text):
        if self._local is not None:
            vec = next(iter(self._local.query_embed([text]))).astype(np.float32)
        else:
            vec = np.array(self._gemini_batch([text])[0], dtype=np.float32)
        n = np.linalg.norm(vec)
        return vec / n if n > 0 else vec

    def _gemini_batch(self, texts):
        requests = [
            {
                "model": GEMINI_MODEL,
                "content": {"parts": [{"text": t[:8000]}]},
                "outputDimensionality": config.EMBED_DIM,
            }
            for t in texts
        ]
        last_err = None
        for attempt in range(8):
            try:
                resp = httpx.post(
                    GEMINI_BATCH_URL,
                    params={"key": config.GEMINI_API_KEY},
                    json={"requests": requests},
                    timeout=60.0,
                )
                if resp.status_code == 429:
                    delay = 12 * (attempt + 1)
                    print(f"    rate limited, waiting {delay}s...", flush=True)
                    time.sleep(delay)
                    continue
                resp.raise_for_status()
                return [e["values"] for e in resp.json()["embeddings"]]
            except httpx.HTTPStatusError:
                raise
            except Exception as err:
                last_err = err
                time.sleep(3)
        raise RuntimeError(f"Gemini embedding failed: {last_err}")

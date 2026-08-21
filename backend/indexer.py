import json
import os

import numpy as np

import config


class VectorIndex:
    def __init__(self, strategy, embeddings, chunks):
        self.strategy = strategy
        self.matrix = embeddings.astype(np.float32)
        norms = np.linalg.norm(self.matrix, axis=1, keepdims=True)
        norms[norms == 0] = 1.0
        self.matrix /= norms
        self.chunks = chunks

    def search(self, query_vec, k):
        scores = self.matrix @ query_vec
        k = min(k, scores.shape[0])
        top = np.argpartition(-scores, k - 1)[:k]
        top = top[np.argsort(-scores[top])]
        return [(int(i), float(scores[i])) for i in top]

    def texts_for(self, hits, expand_parents=True):
        out = []
        for i, score in hits:
            chunk = self.chunks[i]
            text = chunk["text"]
            if expand_parents and self.strategy == "hierarchical":
                parent_id = chunk["meta"].get("parent")
                if parent_id:
                    parent = self._by_parent_child.get(parent_id)
                    if parent:
                        text = parent["text"]
            out.append({"score": round(score, 4), "passage_id": chunk["meta"]["passage_id"], "position": chunk["meta"].get("position"), "text": text})
        return out


def load_index(strategy, index_dir=None, embedder=None):
    index_dir = index_dir or config.INDEX_DIR
    emb_path = os.path.join(index_dir, f"{strategy}.npz")
    meta_path = os.path.join(index_dir, f"{strategy}.chunks.jsonl")
    data = np.load(emb_path)["embeddings"]
    with open(meta_path, "r", encoding="utf-8") as f:
        chunks = [json.loads(line) for line in f]
    idx = VectorIndex(strategy, data, chunks)
    idx._by_parent_child = {}
    if strategy == "hierarchical":
        for c in chunks:
            pid = c["meta"].get("passage_id")
            pos = c["meta"].get("position", "")
            if pos.startswith("child-0") and pid:
                idx._by_parent_child[pid] = c
    return idx


def embed_query(embedder, text):
    vec = next(iter(embedder.query_embed([text]))).astype(np.float32)
    n = np.linalg.norm(vec)
    return vec / n if n > 0 else vec

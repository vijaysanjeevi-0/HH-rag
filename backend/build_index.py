import hashlib
import json
import os
import sys

import numpy as np
import pyarrow.parquet as pq

sys.path.insert(0, os.path.dirname(__file__))
import chunking
import config

PARQUET_PATH = os.path.join(os.path.dirname(__file__), "data", "hinval.parquet")
MAX_PASSAGES = int(os.getenv("MAX_PASSAGES", "2500"))
MAX_BENCH_QUERIES = 40


def iter_rows(batch_size=1024):
    pf = pq.ParquetFile(PARQUET_PATH)
    for batch in pf.iter_batches(batch_size=batch_size, columns=["Eng_Query", "passages"]):
        cols = batch.to_pydict()
        for q, passages in zip(cols["Eng_Query"], cols["passages"]):
            yield q, passages


def main():
    passages, seen = [], set()
    bench = []
    for eng_query, p in iter_rows():
        if not p or not p.get("English_passages"):
            continue
        for text, selected in zip(p["English_passages"], p["is_selected"]):
            if not text or len(text) < 60:
                continue
            pid = chunking.passage_id_of(text)
            if pid not in seen:
                seen.add(pid)
                passages.append({"passage_id": pid, "text": text})
            if selected and eng_query and len(bench) < MAX_BENCH_QUERIES:
                clean = eng_query.strip().lstrip(".- ").strip()
                if clean:
                    bench.append({"query": clean, "passage_id": pid})
        if len(passages) >= MAX_PASSAGES and len(bench) >= MAX_BENCH_QUERIES:
            break

    print(f"passages: {len(passages)}, benchmark queries: {len(bench)}")

    from embedder import Embedder
    embedder = Embedder()
    print(f"embedding provider: {embedder.provider}", flush=True)

    os.makedirs(config.INDEX_DIR, exist_ok=True)
    with open(os.path.join(config.INDEX_DIR, "benchmark.jsonl"), "w", encoding="utf-8") as f:
        for b in bench:
            f.write(json.dumps(b) + "\n")

    for strategy in config.STRATEGIES:
        emb_path = os.path.join(config.INDEX_DIR, f"{strategy}.npz")
        meta_path = os.path.join(config.INDEX_DIR, f"{strategy}.chunks.jsonl")
        if os.path.exists(emb_path) and os.path.exists(meta_path):
            print(f"{strategy}: already built, skipping", flush=True)
            continue
        chunks = chunking.chunk_passages(passages, strategy)
        texts = [c["text"] for c in chunks]
        print(f"{strategy}: {len(chunks)} chunks, embedding...", flush=True)
        embeddings = embedder.embed_documents(texts, progress=True)
        np.savez_compressed(emb_path, embeddings=embeddings)
        with open(meta_path, "w", encoding="utf-8") as f:
            for c in chunks:
                f.write(json.dumps(c) + "\n")
        print(f"  saved {embeddings.shape}", flush=True)

    with open(os.path.join(config.INDEX_DIR, "meta.json"), "w", encoding="utf-8") as f:
        json.dump({"provider": embedder.provider, "model": embedder.model_name, "dim": config.EMBED_DIM}, f)

    print("done")


if __name__ == "__main__":
    main()

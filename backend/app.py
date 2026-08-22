import asyncio
import json
import os
import time

os.environ.setdefault("OMP_NUM_THREADS", "1")
os.environ.setdefault("OPENBLAS_NUM_THREADS", "1")
os.environ.setdefault("MKL_NUM_THREADS", "1")

from fastapi import FastAPI, File, Form, UploadFile
from fastapi.middleware.cors import CORSMiddleware

import config
import pipeline
from indexer import load_index

app = FastAPI(title="HH-RAG Backend", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

state = {"indexes": {}, "embedder": None, "ready": False}


@app.on_event("startup")
async def startup():
    from embedder import Embedder
    state["embedder"] = Embedder()
    state["embedder"].embed_query("warmup")
    for strategy in config.STRATEGIES:
        state["indexes"][strategy] = load_index(strategy)
    state["ready"] = True


def _percentiles(values):
    if not values:
        return {}
    s = sorted(values)
    def pct(p):
        return s[max(0, int(-(-len(s) * p // 100)) - 1)]
    return {"p50": pct(50), "p70": pct(70), "p100": s[-1]}


@app.get("/health")
async def health():
    return {
        "status": "ok" if state["ready"] else "loading",
        "strategies": {k: len(v.chunks) for k, v in state["indexes"].items()},
        "model": config.EMBED_MODEL,
    }


@app.post("/api/v1/query")
async def query(
    file: UploadFile | None = File(default=None),
    text: str | None = Form(default=None),
    stt_provider: str = Form(default="sarvam"),
    chunking_strategy: str = Form(default="hybrid-semantic"),
    guardrails: bool = Form(default=True),
):
    if not state["ready"]:
        return {"error": "Index still loading, retry shortly"}, 503
    audio_bytes = await file.read() if file else None
    if audio_bytes is None and not text:
        return {"error": "Provide either an audio file or text"}, 400
    try:
        result = await pipeline.run_query(
            indexes=state["indexes"],
            embedder=state["embedder"],
            audio_bytes=audio_bytes,
            text=text,
            stt_provider=stt_provider,
            chunking_strategy=chunking_strategy,
            use_guardrails=guardrails,
        )
        return result
    except Exception as err:
        return {"error": str(err)}


@app.get("/benchmark")
async def benchmark(n: int = 30):
    bench_path = os.path.join(config.INDEX_DIR, "benchmark.jsonl")
    if not os.path.exists(bench_path):
        return {"error": "benchmark.jsonl not found"}
    with open(bench_path, "r", encoding="utf-8") as f:
        queries = [json.loads(line)["query"] for line in f][:max(1, min(n, 100))]

    legs = {"embed_ms": [], "retrieve_ms": [], "generate_ms": [], "total_ms": []}
    started = time.perf_counter()
    for q in queries:
        result = await pipeline.run_query(
            indexes=state["indexes"], embedder=state["embedder"],
            text=q, chunking_strategy="hybrid-semantic",
        )
        for k in legs:
            legs[k].append(result["timings"][k])
    wall_ms = round((time.perf_counter() - started) * 1000 / len(queries))

    return {
        "n_queries": len(queries),
        "strategy": "hybrid-semantic",
        "wall_clock_avg_ms": wall_ms,
        "percentiles": {k: _percentiles(v) for k, v in legs.items()},
    }

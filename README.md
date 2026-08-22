# HH-RAG

Voice-enabled Retrieval-Augmented Generation system built for **HH Goa 2026 — Shortlisting Task 2**.

Speak a question -> the pipeline transcribes it, retrieves relevant context from the [MSMARCO-XI](https://huggingface.co/datasets/ai4bharat/MSMARCO-XI) dataset, and returns a grounded answer.

**Pipeline shape:** Voice input -> Speech-to-text -> Chunking / Vector retrieval -> Answer generation

## Features

- Voice capture in the browser (WebM/Opus via MediaRecorder)
- Three pluggable STT providers: Sarvam AI (primary), ElevenLabs Scribe and Groq Whisper (fallbacks)
- Multiple chunking strategies: hybrid semantic + overlap, hierarchical parent-child, metadata-aware
- Grounding guardrails: unsafe-input blocking, off-topic refusal with reasons, hallucination checks
- Live latency analytics: per-query E2E latency plus true P50 / P70 / P100 percentiles (persisted in localStorage)
- Pipeline Trace: per-leg telemetry rendered as a proportional timeline (STT -> Embed -> Retrieve -> Generate) after every query, with an in-flight indicator while executing
- On-device query history: last 20 request/response records with full per-leg timings, persisted in localStorage; click any record to replay its trace
- Dual themes: one-click Dawn / Dusk switch across the entire UI

## Tech stack

| Layer     | Tech                                  |
| --------- | ------------------------------------- |
| Frontend  | React 18, Vite 5, Tailwind CSS 3      |
| Icons     | lucide-react                          |
| Backend   | FastAPI, fastembed embeddings, Groq LLM — deployed on Render |
| Dataset   | ai4bharat/MSMARCO-XI                  |

## Architecture

Everything heavy runs on free cloud machines - user devices only ever need a browser.

```
Phone / Tablet / Laptop        Netlify                Backend (Render free VM)
(just a browser)               (static files)         (ragi-3f8o.onrender.com)
      |                            |                        |
   open link --------------> loads UI (~2 MB)                  |
   record audio -------------------|-------------> POST /api/v1/query
       |                            |                      vector index in
       |                            |                      *server* RAM,
       |<--------------- answer JSON <-------------------- search runs there
```

- **User devices** run nothing but a browser: mic in, speaker out. No install, no local compute.
- **Netlify** serves the static UI from a CDN - any device that can open a URL works.
- **Backend** loads all three pre-built vector indexes into its own RAM once at boot; every query
  from every device is answered by that machine. We own zero servers.

## Free-tier budget

The entire system runs on free tiers - no credit card anywhere in the chain.

| Layer           | Service                       | Free limit                        | In practice                                          |
| --------------- | ----------------------------- | --------------------------------- | ---------------------------------------------------- |
| Frontend host   | Netlify                       | 100 GB bandwidth / month          | App is ~2 MB -> ~50,000 visits / month               |
| Backend host    | Render web service            | 750 instance-hours / month        | Enough to run one always-on service                  |
| Keep-alive      | GitHub Actions cron           | Unlimited on public repos         | Ping `/health` every 10 min so Render never sleeps   |
| Retrieval       | In-memory index               | Container CPU/RAM                 | P50 retrieval 4 ms; thousands of queries/day easily  |
| Speech-to-text  | Sarvam primary; ElevenLabs + Groq Whisper fallbacks | Monthly quotas per provider | One provider dies mid-demo -> switch in one click    |
| Answer LLM      | Groq (`openai/gpt-oss-20b`)   | Generous free token quota         | JSON-mode grounded answers, retries + timeouts       |

STT is the only metered layer, and it has two independent backups.

## Measured latency (30-query benchmark, hybrid-semantic strategy)

| Leg                | P50     | P70     | P100    |
| ------------------ | ------- | ------- | ------- |
| Embed query        | 250 ms  | 266 ms  | 342 ms  |
| Vector retrieval   | **4 ms**| **6 ms**| **18 ms**|
| LLM generation     | 1027 ms | 1404 ms | 5158 ms |

Retrieval leg comfortably beats the 200 ms target; end-to-end time is dominated by
external STT/LLM API calls, which are reported honestly per query in the UI.

## Getting started

Prereqs: Node 18+, npm 9+ (frontend). Python 3.12+ (backend).

```bash
# Frontend
npm install
npm run dev            # http://localhost:5173
```

```bash
# Backend (optional locally - a live one already runs at ragi-3f8o.onrender.com)
cd backend
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
SARVAM_API_KEY=... GROQ_API_KEY=... .venv/bin/python -m uvicorn app:app --port 8000
```

To point the app at your own backend:

```bash
echo "VITE_API_ENDPOINT=https://your-backend.example.com/api/v1/query" > .env
```

## Project structure

```
src/
├── App.jsx        # Full voice pipeline UI: capture, config, transcript, answers, latency stats
├── main.jsx       # React entry point
└── index.css      # Tailwind directives
backend/
├── app.py         # FastAPI: POST /api/v1/query, GET /health, GET /benchmark
├── pipeline.py    # Harness: orchestration, retries, per-leg timings, error recovery
├── chunking.py    # The three chunking strategies
├── indexer.py     # In-memory vector search over pre-built indexes
├── embedder.py    # Query embedding (fastembed local, CPU ONNX)
├── stt.py         # Sarvam / ElevenLabs / Groq Whisper clients
├── llm.py         # Groq client, strict-JSON grounded generation
├── guardrails.py  # Unsafe-input blocklist, off-topic gate, grounding checks
├── build_index.py # Rebuilds indexes from MSMARCO-XI parquet
└── index/         # Committed artifacts: 3 strategies x (embeddings + chunks) ~8 MB
```

## Status

- [x] Frontend client (this repo)
- [x] STT integration (Sarvam primary, ElevenLabs + Groq Whisper fallbacks)
- [x] Chunking + vector indexing over MSMARCO-XI (three strategies, committed indexes)
- [x] Retrieval harness with retries / structured I/O / per-leg telemetry
- [x] Guardrails: unsafe-input blocklist, off-topic refusal with reasons, grounding checks
- [x] Latency validation: 30-query benchmark, P50/P70/P100 published above

## Team — SVM Gladiators

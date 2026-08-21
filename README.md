# HH-RAG

Voice-enabled Retrieval-Augmented Generation system built for **HH Goa 2026 — Shortlisting Task 2**.

Speak a question -> the pipeline transcribes it, retrieves relevant context from the [MSMARCO-XI](https://huggingface.co/datasets/ai4bharat/MSMARCO-XI) dataset, and returns a grounded answer.

**Pipeline shape:** Voice input -> Speech-to-text -> Chunking / Vector retrieval -> Answer generation

## Features

- Voice capture in the browser (WebM/Opus via MediaRecorder)
- Pluggable STT provider (Sarvam AI / ElevenLabs)
- Multiple chunking strategies: hybrid semantic + overlap, hierarchical parent-child, metadata-aware
- Grounding guardrails on generated answers
- Live latency analytics: last-query, true P50 / P70 / P100 percentiles across all queries (persisted in localStorage)

## Tech stack

| Layer     | Tech                                  |
| --------- | ------------------------------------- |
| Frontend  | React 18, Vite 5, Tailwind CSS 3      |
| Icons     | lucide-react                          |
| Backend   | Separate service, reached via `VITE_API_ENDPOINT` |
| Dataset   | ai4bharat/MSMARCO-XI                  |

## Architecture

Everything heavy runs on free cloud machines - user devices only ever need a browser.

```
Phone / Tablet / Laptop        Netlify                Backend (HF Space)
(just a browser)               (static files)         (free cloud server)
      |                            |                        |
   open link --------------> loads UI (~2 MB)                  |
   record audio -------------------|-------------> POST /query ->|
      |                            |                      index loaded in
      |                            |                      *server* RAM,
      |<--------------- answer JSON <-------------------- search runs there
```

- **User devices** run nothing but a browser: mic in, speaker out. No install, no local compute.
- **Netlify** serves the static UI from a CDN - any device that can open a URL works.
- **Backend** loads the whole vector index into its own RAM once at boot; every query
  from every device is answered by that machine. We own zero servers.

## Free-tier budget

The entire system runs on free tiers - no credit card anywhere in the chain.

| Layer           | Service                       | Free limit                        | In practice                                          |
| --------------- | ----------------------------- | --------------------------------- | ---------------------------------------------------- |
| Frontend host   | Netlify                       | 100 GB bandwidth / month          | App is ~2 MB -> ~50,000 visits / month               |
| Backend host    | HuggingFace Spaces            | 2 vCPU / 16 GB RAM container      | No request counter; sleeps only after 48 h idle      |
| Keep-alive      | GitHub Actions cron           | Unlimited on public repos         | Daily ping to `/health` so the Space never sleeps    |
| Retrieval       | In-memory index               | Container CPU/RAM                 | Sub-ms exact search; thousands of queries/day easily |
| Speech-to-text  | Sarvam / ElevenLabs free tier | Monthly audio-minutes quota       | ~8 s per question -> ~75-110 voice queries / month   |
| Fallback input  | Text box in UI                | None                              | Typed questions skip STT -> unlimited queries        |

The only metered layer is STT. Development uses saved transcripts locally so the
live quota stays untouched until the real demo.

## Getting started

Prereqs: Node 18+, npm 9+

```bash
npm install
npm run dev
```

Open http://localhost:5173, tap the orb, and ask away.

To point the app at your own backend:

```bash
echo "VITE_API_ENDPOINT=https://your-backend.example.com/api/v1/query" > .env
```

## Project structure

```
src/
├── App.jsx      # Full voice pipeline UI: capture, config, transcript, answers, latency stats
├── main.jsx     # React entry point
└── index.css    # Tailwind directives
```

## Status

- [x] Frontend client (this repo)
- [ ] STT integration (Sarvam)
- [ ] Chunking + vector indexing over MSMARCO-XI
- [ ] Retrieval harness with retries / structured I/O
- [ ] Guardrails: off-topic refusal, hallucination checks
- [ ] Sub-200ms end-to-end latency validation

## Team — SVM Gladiators

CSE Cybersecurity — Dhanalakshmi College of Engineering

- Sultan Suhail Ahamed MF
- Vijay Sanjeevi D
- Manoj K

We build under **iSquare (Independent Innovators)** — a company founded by our friend.

---

Built for #RAGInGoa. Licensed under MIT.

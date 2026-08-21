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

## Team

CSE Cybersecurity — Dhanalakshmi College of Engineering

- Sultan Suhail Ahamed MF
- Vijay Sanjeevi D
- Manoj K

---

Built for #RAGInGoa. Licensed under MIT.

# AGENTS.md — context for AI assistants resuming work on this repo

Read this before making changes. It captures everything about the project state.

## What this is

HH-RAG — frontend client for a voice-enabled RAG system, built for
**HH Goa 2026 Shortlisting Task 2** (deadline: Aug 22, 2026, 11:59 PM).

Pipeline: Voice input -> STT -> chunking/vector retrieval -> grounded answer.
This repo is ONLY the frontend; the RAG backend is a separate service built by teammates.

## Team

SVM Gladiators — Sultan Suhail Ahamed MF, Vijay Sanjeevi D (repo owner,
github: vijaysanjeevi-0), Manoj K. CSE Cybersecurity, Dhanalakshmi College
of Engineering. Part of iSquare (Independent Innovators).
GitHub repo: https://github.com/vijaysanjeevi-0/HH-rag

## Stack & constraints

- Vite 5 + React 18 + Tailwind CSS 3.4 + lucide-react
- **Node 18 on this machine** — do NOT upgrade vite to v6/7 or tailwind to v4
  (both require Node 20+). Versions are pinned in package.json for this reason.
- No TypeScript — App code is plain JSX (original file was .tsx but had no TS syntax)

## Key files

- `src/App.jsx` — entire UI in one component: mic capture (MediaRecorder,
  WebM/Opus), config panel, transcript/answer panels, latency analytics
- `src/main.jsx`, `src/index.css` — standard entry + tailwind directives
- `vite.config.js` — react plugin only
- Original source file preserved at ~/Documents/app.tsx (pre-cleanup version)

## Backend contract

POST multipart/form-data to `import.meta.env.VITE_API_ENDPOINT`
(default: https://voice-hhgoa.onrender.com/api/v1/query) with fields:
- `file`: audio webm blob
- `stt_provider`: 'sarvam' | 'elevenlabs'
- `chunking_strategy`: 'hybrid-semantic' | 'hierarchical' | 'metadata-aware'
- `guardrails`: boolean

Expects JSON response: `{ transcript: string, answer: string }`.
Backend is on Render free tier — sleeps after ~15 min idle; first request
after sleep fails/times out. Not a frontend bug.

## Latency analytics (requirement #4 of task)

- Every successful query's round-trip ms is pushed to `latenciesRef`
  and persisted to localStorage key `rag-latency-history`
- P50/P70/P100 computed by nearest-rank method (`percentileOf` helper),
  recomputed from full history on page load
- To reset stats: `localStorage.removeItem('rag-latency-history')`

## Known open items

- Guardrails are user-toggleable via checkbox — flagged as risky for judging
  (task req #6 wants guardrails always-on); consider hardcoding ON
- STT provider dropdown offers Sarvam AND ElevenLabs; task doc says "pick one"
- Not yet deployed — submission needs a live link (Vercel/Netlify will work;
  set VITE_API_ENDPOINT there)
- Two videos + submission form still pending (team's responsibility)

## Environment quirks

- Pushing happens from the USER'S OWN terminal (PAT auth) — the agent shell
  has no GitHub credentials; `git push` from here always fails
- /tmp/opencode exists for temp files but was not writable once; use project
  dir for logs instead (dev.log is gitignored)
- Dev server may still be running in background from earlier sessions
  (`pkill -f vite` to stop); verify with `curl localhost:5173`

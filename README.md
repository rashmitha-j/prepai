# PrepAI — AI Interview Coach

PrepAI is a full-stack AI interview-preparation platform. A candidate uploads a resume, pastes a job description, sees which required skills they already cover, then takes an **adaptive mock interview**: questions are generated one at a time from their resume, the job, their previous answers and a **RAG knowledge base**, every answer is scored against a fixed rubric, follow-ups probe weak answers, and the session ends with a report and a personalised learning roadmap. There is also a C++ coding-practice module with a sandboxed judge.

It is deliberately *not* "React → API → ChatGPT → display answer". The interesting parts are the provider abstraction, schema-validated structured outputs, embeddings + vector search, multi-turn interview state, deterministic scoring, graceful degradation and the test/eval harness.

---

## Contents

1. [Features](#features)
2. [Architecture](#architecture)
3. [Tech stack](#tech-stack)
4. [How the LLM integration works](#how-the-llm-integration-works)
5. [How RAG works](#how-rag-works)
6. [Why embeddings are used](#why-embeddings-are-used)
7. [Ollama setup](#ollama-setup)
8. [Alternative API-provider setup](#alternative-api-provider-setup)
9. [MongoDB setup](#mongodb-setup)
10. [Environment variables](#environment-variables)
11. [Local installation](#local-installation)
12. [Running all services](#running-all-services)
13. [Testing](#testing)
14. [API overview](#api-overview)
15. [Security](#security)
16. [Deployment architecture](#deployment-architecture)
17. [Known limitations](#known-limitations)
18. [Future improvements](#future-improvements)
19. [How I would explain this project in an interview](#how-i-would-explain-this-project-in-an-interview)

---

## Features

| Area | What it does |
|---|---|
| Auth | Register / login / logout, JWT sessions persisted across reloads, change password (invalidates older tokens), profile edit, account deletion with full data erasure |
| Resumes | PDF upload (signature-checked, size-limited, temp file always deleted), text extraction, AI analysis → skills, technologies, projects, experience, education, strengths, possible gaps |
| Job descriptions | Paste a posting → required / preferred skills, responsibilities, technologies, experience level |
| Match analysis | "Interview Preparation Match Analysis": deterministic skill overlap + approximate coverage %, relevant projects, experience alignment, likely topics, recommendations. Explicitly not a hiring decision |
| Mock interview | 13 categories (DSA, DBMS, SQL, OS, CN, OOP, JS, React, Node, System Design, Resume, Behavioral, Mixed), 3 difficulties. One question at a time; next question depends on previous answers; follow-ups when the evaluator flags a gap |
| Evaluation | Rubric scores for correctness, relevance, technical depth, clarity, completeness, communication; strengths, missing points, suggestions, model answer, RAG sources |
| Reports | Summary, strengths, weak areas, technical gaps, communication feedback, recommended topics, step-by-step roadmap, per-topic and per-dimension averages |
| Coding | 11 C++ problems (easy → hard) with examples, constraints, starter code, visible + hidden tests; "Run samples" and "Submit"; sandboxed compile/run; optional AI explanation of the result |
| Knowledge base | 13 curated study documents (DSA, DBMS, SQL, OS, CN, OOP, System Design, JavaScript, React, Node.js, MongoDB, REST APIs, Behavioral); semantic search UI showing chunks and similarity scores |
| Dashboard | Counts, average score, score trend, recent interviews, weak/strong topics across reports, recommended topics, coding progress by difficulty |

---

## Architecture

```text
                        ┌──────────────────────────────────────────────┐
  Browser (React SPA)   │  Vite + React Router + Axios                 │  Vercel
                        └───────────────┬──────────────────────────────┘
                                        │ HTTPS, Bearer JWT
                        ┌───────────────▼──────────────────────────────┐
                        │  Node.js / Express API          (backend/)   │  Render
                        │  auth · validation · rate limits · uploads   │
                        │  interview state machine · C++ judge         │
                        │  dashboard · knowledge-base source of truth  │
                        └───────┬───────────────────────────┬──────────┘
                     Mongoose   │                           │ HTTP + X-Internal-Token
                        ┌───────▼────────┐    ┌─────────────▼────────────────────────┐
                        │ MongoDB        │    │ Python FastAPI AI service (ai-service/)│  Render
                        │ (Atlas in prod)│    │  prompts · structured-output validation│
                        └────────────────┘    │  skill taxonomy · scoring · RAG        │
                                              │   ┌─────────────┐   ┌───────────────┐  │
                                              │   │ AIProvider  │   │ VectorStore   │  │
                                              │   │ Ollama/API  │   │ Chroma/local  │  │
                                              │   └──────┬──────┘   └───────────────┘  │
                                              └──────────┼─────────────────────────────┘
                                                         │
                                        Ollama (local)  or  OpenAI / Gemini / Groq / any
                                                            OpenAI-compatible endpoint
```

**Responsibilities**

- **Frontend** — presentation only. Never talks to the AI service or an LLM.
- **Node backend** — the system of record: users, documents, interview sessions, reports, submissions. Owns the interview **state machine** and all authorization. Compiles/runs code in a sandbox.
- **AI service** — stateless intelligence layer: provider abstraction, prompt construction, JSON extraction + Pydantic validation + repair retry, deterministic skill matching and scoring, RAG ingestion/retrieval. Only the backend can call it (shared token).
- **MongoDB** — stores everything, including the knowledge-base documents (source of truth). The vector index is a derived, rebuildable copy.

### Interview flow (multi-turn state)

```text
POST /api/interviews ─► backend builds compact context (resume summary, skills, projects, job skills, missing skills)
                    └─► AI /interview/question (RAG on category topics) ─► turn 1 persisted
POST /:id/answer    ─► AI /interview/evaluate (RAG on the question) ─► scores + feedback persisted
                    ├─► evaluator suggests follow-up & budget left ─► AI /interview/follow-up ─► follow-up turn
                    ├─► else more main questions ─► AI /interview/question with history (scores, missed points,
                    │                                   answer excerpts, already-used chunks excluded)
                    └─► else finished ─► client offers "Finish"
POST /:id/complete  ─► AI /interview/report (computed stats + transcript + RAG study notes) ─► InterviewReport
```

If the evaluation succeeds but next-question generation fails, the evaluation is still saved and `POST /:id/next` retries. If evaluation fails, nothing is saved and the answer stays in the textarea (and in session storage).

### Project structure

```text
prepai/
├── backend/                     Node.js + Express + Mongoose
│   ├── src/
│   │   ├── config/              env validation (zod), Mongo connection (sanitizeFilter)
│   │   ├── controllers/         thin HTTP handlers
│   │   ├── middleware/          auth, validation, rate limits, upload, unsafe-key rejection, errors
│   │   ├── models/              9 Mongoose models
│   │   ├── routes/              /api/* routers
│   │   ├── services/            business logic, aiClient, codeRunner (judge), dashboard, knowledge
│   │   ├── seed/                seed.js, knowledge/*.md (13 docs), problems.json (11 problems)
│   │   ├── utils/  validators/
│   │   ├── app.js  server.js
│   ├── tests/                   Jest + Supertest (10 suites) + reference C++ solutions
│   ├── Dockerfile  .env.example
├── ai-service/                  Python FastAPI
│   ├── app/
│   │   ├── api/routes.py        all endpoints
│   │   ├── core/                config, errors, security, container (DI), json_utils
│   │   ├── models/              Pydantic schemas + sanitising field types
│   │   ├── providers/           base (AIProvider/Embedder), ollama, api_provider, hashing_embedder, factory
│   │   ├── rag/                 loaders, cleaning, chunking, vector_store, pipeline, bootstrap, cli
│   │   ├── services/            analysis, interview, coding, prompts, skills taxonomy
│   │   └── main.py
│   ├── tests/                   pytest (7 files), fixtures, scripted provider, stub server
│   ├── requirements*.txt  pyproject.toml  Dockerfile  README.md  .env.example
├── frontend/                    React + Vite
│   ├── src/{api,components,context,hooks,pages,utils,test}  App.jsx  main.jsx  index.css
│   ├── vercel.json  Dockerfile  nginx.conf  .env.example
├── scripts/                     setup-ai.js, run-ai.js (cross-platform Python launcher), check-secrets.js
├── docker-compose.yml  render.yaml  package.json (workspaces)  .nvmrc  .gitignore
```

### Database models

| Model | Purpose | Key indexes |
|---|---|---|
| `User` | name, email (normalised, unique), bcrypt `password` (`select:false`), bio, role | `email` unique |
| `Resume` | user, filename, extracted text (`select:false`), skills, technologies, projects, experience, education, strengths, gaps, analysis status/mode | `{user, createdAt}` |
| `JobDescription` | user, title, company, rawText, required/preferred skills, responsibilities, technologies, experienceLevel | `{user, createdAt}` |
| `MatchAnalysis` | one result per (user, job, resume) | `{user, job, resume}` unique |
| `InterviewSession` | user, resume/job refs, role, difficulty, category, context snapshot, embedded `turns[]` (question, answer, evaluation, sources), status, startedAt/completedAt | `{user, createdAt}`, `{user, status, completedAt}` |
| `InterviewReport` | one per session: summary, strengths, weak areas, gaps, roadmap, averages, sources | `session` unique, `{user, createdAt}` |
| `CodingProblem` | slug, statement, examples, constraints, starter code, test cases (hidden flag) | `slug` unique, `{difficulty, order}` |
| `CodingSubmission` | user, problem, code, verdict, per-test results (no hidden data), AI explanation | `{user, problem, createdAt}`, `{user, verdict}` |
| `KnowledgeDocument` | docId, title, topic, content (source of truth for RAG), ingestion status, chunk count, embedding id | `docId` unique, `topic` |

Turns are embedded in the session (bounded, always read together); resumes/jobs are referenced. The session stores a small **context snapshot** so deleting a resume never breaks past interviews — a deliberate, small duplication.

---

## Tech stack

- **Frontend:** React 19, Vite, React Router 7, Axios, plain CSS design tokens (IBM Plex Sans), Vitest + Testing Library
- **Backend:** Node.js 22, Express 5, MongoDB + Mongoose, JWT (`jsonwebtoken`), `bcrypt`, `helmet`, `cors`, `express-rate-limit`, `multer`, `pdf-parse`, `zod`, Jest + Supertest
- **AI service:** Python 3.11, FastAPI, Pydantic v2, httpx, NumPy, ChromaDB, pypdf, pytest, ruff
- **LLM providers:** Ollama (local default); OpenAI, Google Gemini (OpenAI-compatible endpoint), Groq, or any OpenAI-compatible server
- **Infra:** Docker / docker-compose, Vercel (frontend), Render (backend + AI service), MongoDB Atlas

---

## How the LLM integration works

All model access goes through one interface (`ai-service/app/providers/base.py`):

```python
class AIProvider(Embedder):
    async def generate(prompt, system=None, ...) -> str
    async def generate_json(prompt, schema: type[BaseModel], ...) -> BaseModel   # validated
    async def embed(texts) -> list[list[float]]
    async def health_check() -> dict
```

- `OllamaProvider` talks to `/api/chat` (with `format: "json"` for structured calls) and `/api/embed`.
- `APIProvider` implements the OpenAI Chat Completions + Embeddings wire format with `response_format: json_object`. Presets supply the base URL for `openai`, `gemini` and `groq`; `openai_compatible` takes any `API_BASE_URL` (OpenRouter, vLLM, LM Studio…).
- `factory.py` is the only place that knows concrete classes; it reads `AI_PROVIDER` from the environment. Business logic never imports a provider. Chat and embeddings are separate roles, so they can come from different vendors (`EMBEDDING_API_PROVIDER`), e.g. Groq for chat and Gemini for embeddings.

**Structured output pipeline** (`generate_json`):

1. The system prompt demands a single JSON object and shows a compact shape example.
2. The raw text is parsed by `extract_json_object` (handles code fences, surrounding prose, braces inside strings, trailing commas).
3. The object is validated by a Pydantic schema whose field types *normalise harmless drift* — a comma-separated string where a list was expected, `"8/10"` as a score, scores out of range (clamped), duplicates, over-long strings, unknown keys (dropped, e.g. a `"thinking"` field).
4. If extraction/validation still fails, the model gets **one repair attempt** containing the exact validation errors, at temperature 0.
5. If that fails too, the request fails with `502 AI_OUTPUT_INVALID` — nothing unvalidated ever reaches the database.

**Things the model is not trusted with:**

- Skill matching is done by a deterministic taxonomy (`services/skills.py`, ~90 skills with aliases, ambiguity-aware), so matching/missing skills and the coverage % are reproducible.
- The overall answer score is a **weighted rubric average computed in code** (correctness 30 %, depth 20 %, relevance 15 %, completeness 15 %, clarity 10 %, communication 10 %).
- Report statistics (averages per topic and dimension) are computed in code and passed to the model as authoritative.
- Relevant projects returned by the model are filtered against the projects that actually exist on the resume (hallucination guard); repeated questions are rejected.

**Graceful degradation:** resume / job / match analysis and the final report fall back to deterministic results when the provider is unavailable, and the response carries `analysisMode: "heuristic"` plus a warning that the UI shows as "Keyword-based". Question generation, evaluation and code explanation have no honest fallback, so they return `503` with an actionable message such as *"Cannot reach Ollama at http://localhost:11434. Is `ollama serve` running?"* or *"Run `ollama pull llama3.1:8b`"*.

---

## How RAG works

```text
KnowledgeDocument (MongoDB, source of truth)
  → /rag/ingest: clean (unicode, whitespace, PDF hyphenation) → chunk → embed (batches of 32) → upsert
  → VectorStore (Chroma collection per embedding model; or local NumPy store)

Question / evaluation / report
  → build a query (category + role + job skills in that category + last missed points)
  → embed query → top-k cosine search, filtered by topic metadata, excluding chunks already used this session
  → [S1] (Operating Systems › Deadlocks) … numbered, source-labelled context, capped at ~3,500 chars
  → prompt → LLM → validated JSON + `sources` returned to the UI
```

- **Chunking** is structure-aware: markdown is split by headings, each chunk keeps its heading path (e.g. `Deadlocks`) as metadata, paragraphs are packed up to ~900 characters (≈200–250 tokens) and oversize paragraphs split by sentence, with ~150 characters of overlap so boundary facts are not lost.
- **Metadata** on every chunk: `docId, title, topic, source, section, chunkIndex, contentHash, embedding` — which is how the UI shows "Grounded in: Deadlocks, Memory Management".
- **Only top-k chunks are sent** — never the whole knowledge base.
- **Category → topic filter** (e.g. `node → [nodejs, rest-api, mongodb]`) keeps retrieval on-topic; "mixed" interviews choose a category per question from the job's skills and the candidate's gaps.
- **Rebuildable index:** on startup the backend compares MongoDB documents with `/rag/stats` and re-ingests anything missing — so an ephemeral disk on Render or a change of embedding model self-heals.
- **CLI:** `python -m app.rag.cli ingest ../backend/src/seed/knowledge`, `... search "what is a deadlock" --topic os`.

### Rebuilding the vector index

`ai-service/data/` (the vector DB) is git-ignored, so every fresh deploy or wiped disk starts with an **empty** index. MongoDB holds the 13 knowledge-base documents; the index is always rebuildable from them.

1. **Once per database** (local, or a new Atlas cluster), store the documents in MongoDB:
   ```bash
   MONGO_URI="<your connection string>" npm run seed    # non-destructive; also indexes them if the AI service is reachable
   ```
2. **Automatic, two independent triggers** (both only embed documents that are missing, and both use the same chunk ids, so running together never duplicates anything):
   - **AI service start:** ingests any document from `RAG_BOOTSTRAP_DIR` (default `../backend/src/seed/knowledge`) missing from the index. It runs in the background, so `/health` answers immediately, and retries with backoff while the embedding provider is still starting. This covers the AI service restarting on its own (e.g. a Render spin-down that wiped its disk). If the directory is not present, e.g. a Docker image without the mount, it logs a warning and skips.
   - **Backend start** (`KNOWLEDGE_AUTO_SYNC=true`): compares MongoDB with `/rag/stats` and re-embeds anything missing, including documents added through the admin API that are not in the markdown folder.
3. **Manual**, if needed (from `ai-service/`):
   ```bash
   python -m app.rag.cli ingest ../backend/src/seed/knowledge
   ```
   Check with `GET /api/health` → `vectorStore.chunks` should be **143**. With `nomic-embed-text` on a CPU-only machine a full rebuild takes about 1.5 minutes; with an API embedder, seconds.

A persistent disk mounted at `VECTOR_DB_PATH` avoids re-embedding after restarts.

## Why embeddings are used

Keyword search misses paraphrases ("two threads each waiting on the other's lock" vs "circular wait"). Embeddings map text to vectors where semantically similar passages are close, so cosine similarity finds relevant material even without shared words. That lets prompts include a few highly relevant paragraphs instead of the entire corpus — improving grounding while keeping tokens, latency and cost down.

The embedding source is configurable with `EMBEDDING_PROVIDER`:

| Value | Embeddings from | Notes |
|---|---|---|
| `auto` (default) | the configured LLM provider (`nomic-embed-text` on Ollama, `API_EMBEDDING_MODEL` on an API) | semantic |
| `ollama` / `api` | force one source (e.g. generate with Gemini, embed locally) | semantic |
| `hash` | built-in deterministic feature-hashing embedder | **lexical only**, no model download; used by tests/CI and as a zero-dependency fallback |

Each embedding model gets its own vector collection, because vectors from different models live in different spaces and must never be mixed.

---

## Ollama setup

```bash
# 1. Install Ollama: https://ollama.com/download
ollama serve                      # starts on http://localhost:11434 (the desktop app does this automatically)
ollama pull llama3.1:8b           # chat model (any instruction-tuned model works, e.g. qwen2.5:7b, mistral)
ollama pull nomic-embed-text      # embedding model
```

Then in `ai-service/.env`: `AI_PROVIDER=ollama`, `OLLAMA_MODEL=llama3.1:8b`, `OLLAMA_EMBEDDING_MODEL=nomic-embed-text`.
Check with `curl http://localhost:8000/health` — `provider.status` should be `ok` and `modelAvailable: true`. 7–8B models work; larger models give noticeably better evaluations.

## Alternative API-provider setup

```bash
# OpenAI
AI_PROVIDER=openai
API_KEY=<your key>
API_MODEL=gpt-4o-mini
API_EMBEDDING_MODEL=text-embedding-3-small

# Google Gemini (OpenAI-compatible endpoint; base URL preset)
AI_PROVIDER=gemini
API_KEY=<your key>
API_MODEL=gemini-3.5-flash-lite          # verified 2026-09 on the key's model list
API_EMBEDDING_MODEL=gemini-embedding-2   # 3072-dim
API_REASONING_EFFORT=low                 # Gemini thinking level: none|minimal|low|medium|high
EMBEDDING_PROVIDER=api

# Groq for chat + Gemini for embeddings (Groq has no embeddings endpoint) — the verified local setup
AI_PROVIDER=groq
API_KEY=<your Groq key>
API_MODEL=openai/gpt-oss-120b            # verified 2026-09; free tier: 1,000 requests/day, 8,000 tokens/min
API_REASONING_EFFORT=low
EMBEDDING_PROVIDER=api
EMBEDDING_API_PROVIDER=gemini            # separate vendor + key for embeddings only
EMBEDDING_API_KEY=<your Gemini key>
API_EMBEDDING_MODEL=gemini-embedding-2
# (or EMBEDDING_PROVIDER=ollama / hash to embed locally)

# Anything OpenAI-compatible (OpenRouter, vLLM, LM Studio…)
AI_PROVIDER=openai_compatible
API_BASE_URL=http://localhost:1234/v1
API_KEY=<key or any non-empty value>
API_MODEL=<model name>
```

Model names change over time — use whatever your provider currently offers (for Gemini: `GET https://generativelanguage.googleapis.com/v1beta/models` with your key).

**Gemini free-tier notes (measured 2026-09-28):** the free tier allowed only **20 requests per day per model** for `gemini-3.8-flash` (`GenerateRequestsPerDayPerProjectPerModel-FreeTier`); one PrepAI interview uses roughly 12–20 chat calls, so the free tier is enough for a demo, not for users. Popular models also return `503 "high demand"` for long stretches. The API provider retries 5xx twice with backoff (2 s, 6 s; honouring `Retry-After`) and does **not** retry 429, which is usually a quota and would only burn requests. A full index rebuild (143 chunks) can hit the free per-minute embedding limit; the startup rebuild backs off and completes on its own. Keys are read from the environment only, never logged, and never included in error messages or `repr()`.

## MongoDB setup

- **Local:** install MongoDB Community 7+ and run `mongod`, or `docker run -d -p 27017:27017 --name prepai-mongo mongo:7`, or `docker compose up mongo`. Default URI: `mongodb://127.0.0.1:27017/prepai`.
- **Atlas:** create a free cluster, a database user with a strong password, allow your backend's IP (or Render's egress), and set `MONGO_URI=mongodb+srv://<user>:<password>@<cluster>/prepai?retryWrites=true&w=majority` in the backend environment (never in code).
- Indexes are created automatically on startup (`autoIndex`).

---

## Environment variables

Only `.env.example` files are committed. Copy each to `.env` in the same folder and fill in values.

**`backend/.env`**

| Variable | Required | Default | Description |
|---|---|---|---|
| `NODE_ENV` | | `development` | `development` / `test` / `production` |
| `PORT` | | `5000` | |
| `MONGO_URI` | ✔ | `mongodb://127.0.0.1:27017/prepai` | |
| `JWT_SECRET` | ✔ | — | ≥ 32 random chars in production (startup refuses placeholders) |
| `JWT_EXPIRES_IN` | | `1d` | |
| `CLIENT_URL` | ✔ | `http://localhost:5173` | comma-separated allowed origins for CORS |
| `AI_SERVICE_URL` | ✔ | `http://localhost:8000` | |
| `AI_SERVICE_TOKEN` | prod | — | shared secret, must equal the AI service's value |
| `AI_REQUEST_TIMEOUT_MS` | | `180000` | local models can be slow |
| `TRUST_PROXY` | | `false` | `true` behind Render/Nginx (real client IP for rate limits) |
| `KNOWLEDGE_AUTO_SYNC` | | `true` | re-index missing KB docs at startup |
| `MAX_UPLOAD_MB` | | `5` | |
| `CODE_RUNNER` | | `process` | `process` / `docker` / `disabled` |
| `CODE_RUNNER_DOCKER_IMAGE` | | `gcc:13` | |
| `ALLOW_UNSAFE_CODE_EXECUTION` | | `false` | process runner is refused in production unless `true` |
| `BCRYPT_ROUNDS` | | `12` | |
| `DEMO_USER_PASSWORD` | | — | optional fixed password for the seeded demo user |

**`ai-service/.env`**

| Variable | Default | Description |
|---|---|---|
| `ENVIRONMENT` | `development` | `production` disables `/docs` and requires `AI_SERVICE_TOKEN` |
| `PORT` | `8000` | |
| `AI_SERVICE_TOKEN` | — | shared secret (required in production) |
| `AI_PROVIDER` | `ollama` | `ollama`, `openai`, `gemini`, `groq`, `openai_compatible` |
| `OLLAMA_BASE_URL` / `OLLAMA_MODEL` / `OLLAMA_EMBEDDING_MODEL` | `http://localhost:11434` / — / `nomic-embed-text` | |
| `API_BASE_URL` / `API_KEY` / `API_MODEL` / `API_EMBEDDING_MODEL` | — | API providers |
| `API_REASONING_EFFORT` | — | optional `reasoning_effort` sent on chat calls (Gemini thinking level / OpenAI reasoning models): `none`, `minimal`, `low`, `medium`, `high` |
| `EMBEDDING_PROVIDER` | `auto` | `auto`, `ollama`, `api`, `hash` |
| `EMBEDDING_API_PROVIDER` / `EMBEDDING_API_KEY` / `EMBEDDING_API_BASE_URL` | — | with `EMBEDDING_PROVIDER=api`: a different vendor for embeddings than for chat (e.g. Groq chat + Gemini embeddings); empty = same vendor, key and URL as chat. The model is `API_EMBEDDING_MODEL` |
| `VECTOR_STORE` / `VECTOR_DB_PATH` | `chroma` / `./data/vector_db` | `local` = NumPy store |
| `RAG_TOP_K` / `CHUNK_SIZE` / `CHUNK_OVERLAP` | `4` / `900` / `150` | |
| `RAG_BOOTSTRAP_DIR` | `../backend/src/seed/knowledge` | markdown knowledge base indexed at startup when documents are missing from the index; empty disables |
| `LLM_TEMPERATURE` / `LLM_TIMEOUT_SECONDS` / `LLM_MAX_OUTPUT_TOKENS` | `0.3` / `120` / `1500` | |

**`frontend/.env`** — `VITE_API_URL=http://localhost:5000` (backend origin, without `/api`); optional `VITE_API_TIMEOUT_MS` (default `300000`).

**Running a local model without a GPU.** On a CPU-only machine an 8B model generates roughly 5–10 tokens/s, so one structured call (resume analysis, evaluation, question) can take 2–5 minutes, and submitting an answer makes two calls. The defaults above are sized for a GPU or an API provider. For CPU-only Ollama, raise the timeouts so each layer waits longer than the one below it (an AI call may be attempted twice because of the repair retry):

```bash
# ai-service/.env
LLM_TIMEOUT_SECONDS=600
# backend/.env
AI_REQUEST_TIMEOUT_MS=1500000
# frontend/.env
VITE_API_TIMEOUT_MS=1800000
```

If a timeout still fires, analyses fall back to keyword mode (labelled "Keyword-based" in the UI) and interview calls return a 503 with a retry option.

---

## Local installation

Prerequisites: **Node.js 20+** (22 recommended, see `.nvmrc`), **Python 3.10+**, **MongoDB**, **g++ with C++17 support, i.e. GCC 7+** (for the coding judge; on Windows a MinGW-w64 g++ on `PATH` works for local development — see the sandbox notes below — or use WSL / `CODE_RUNNER=docker`), and **Ollama** or an API key.

```bash
cd prepai
npm run setup          # npm install (all workspaces) + creates ai-service/.venv and installs Python deps

cp backend/.env.example backend/.env          # set JWT_SECRET (and MONGO_URI if not local)
cp ai-service/.env.example ai-service/.env    # set OLLAMA_MODEL (or an API provider)
cp frontend/.env.example frontend/.env

npm run seed                       # knowledge base + coding problems (dev only, non-destructive)
npm run seed -- --demo-user        # optional: demo@prepai.dev with a generated password printed once
npm run seed -- --reset --yes      # DESTRUCTIVE: wipes KB docs, problems and submissions first
```

## Running all services

One command (frontend on :5173, backend on :5000, AI service on :8000):

```bash
npm run dev
```

If running Python through npm is awkward on your machine, use three terminals:

```bash
# 1 — AI service
cd ai-service && source .venv/bin/activate      # Windows: .venv\Scripts\activate
uvicorn app.main:app --reload --port 8000
# 2 — backend
npm run dev -w backend
# 3 — frontend
npm run dev -w frontend
```

Open http://localhost:5173. Health: `curl localhost:5000/api/health` and `curl localhost:8000/health`.

**Docker:** `docker compose up --build` starts MongoDB, the AI service, the backend and the frontend (nginx) on the same ports. Ollama stays on the host; the AI container reaches it through `host.docker.internal`. Then run the seed once: `docker compose exec backend node src/seed/seed.js`.

---

## Testing

```bash
npm test               # backend (Jest) + frontend (Vitest) + AI service (pytest)
npm run lint           # ESLint backend + frontend, ruff for Python
npm run build          # production frontend build
npm run check:secrets  # scans sources for key-like strings; confirms .env files are git-ignored
```

- **No test needs Ollama or network access.** AI calls are mocked in the backend (`jest.mock(aiClient)`), and the AI service tests use `tests/stub_provider.py` — a *scripted* provider that returns canned JSON and is not selectable through app configuration.
- **Backend DB:** tests use `mongodb-memory-server` (downloads a MongoDB binary on first run) or any MongoDB you point `MONGO_TEST_URI` at, e.g. `MONGO_TEST_URI=mongodb://127.0.0.1:27017 npm run test:backend`. Each test file uses a random database that is dropped afterwards.
- **Coding judge tests** compile real C++ (skipped automatically if `g++` is missing). `problems.data.test.js` runs every reference solution against every seeded test case, so broken problem data cannot ship.

What is covered: registration/login/generic errors, JWT tampering/`alg:none`/expiry/deleted users/password-change invalidation, authorization (cross-user 404s, admin-only 403s), NoSQL-injection and prototype-pollution attempts, malformed/oversized JSON, PDF upload validation (fake PDFs, wrong MIME/extension, empty/corrupt/oversized files, temp-file cleanup, filename sanitisation), job creation and match analysis, full interview flow including follow-ups, adaptive history, retry after AI failures and completion, AI-service error translation over real HTTP (503/502/422/401/timeout/unreachable), RAG chunking/embeddings/vector stores (both Chroma and local)/topic filters/exclusions, provider transport errors via `httpx.MockTransport`, JSON repair, schema normalisation, dashboard aggregation, judge verdicts (AC/WA/CE/TLE/RE/OLE/MLE, network blocked).

### AI evaluation fixtures

`ai-service/tests/fixtures/` contains a realistic resume, a job description, expected extracted fields, graded sample answers (strong / partial / weak / off-topic) and recorded messy model-output shapes.

- **Offline (always run):** deterministic extractor recall on the resume, required-vs-preferred split on the JD, schema normalisation of messy outputs, and a **retrieval-quality eval**: 13 queries over the real knowledge base must retrieve the correct topic in the top 3 (and top-1 for ≥ 75 %) even with the lexical baseline embedder.
- **Live (opt-in):** `PREPAI_LIVE_AI=1 npm run test:ai` runs the *configured* model on the same fixtures: resume skill recall ≥ 0.8, correct experience level, and scores ordered strong > partial > weak with off-topic < 4. This measures a model; it does not prove the AI is always right.

### Verification status: real model vs mocked provider

**Tested with a real Ollama model** (`llama3.1:8b` + `nomic-embed-text` on Ollama 0.34.4, Windows 11, CPU only, 16 GB RAM):

| What | Result |
|---|---|
| Live AI tests (`PREPAI_LIVE_AI=1`) | 2/2 passed: resume skill recall 1.00; answer scores strong 8.1 > partial 4.3 > weak 0.0, off-topic 0.0 |
| Embeddings | 768-dimensional vectors; 13 KB documents → 143 chunks in Chroma |
| Semantic retrieval | 8/8 test queries returned the correct topic first (e.g. "process vs thread" → OS › Processes and Threads, "database indexes" → DBMS › Indexing, "horizontal scaling" → System Design › Scalability) |
| Browser E2E (headless Edge, real UI) | register → resume PDF upload → job → match → personalised interview (3 main questions + 2 follow-ups) → evaluation → report → roadmap; all AI steps returned `analysisMode: "ai"`, no console errors |
| Grounding | model answers reused retrieved knowledge-base passages; questions referenced resume projects (DevConnect) and job requirements (SQL) |
| Responsive | no horizontal overflow or console errors at 375 / 768 / 1280 px |

Behaviour seen with the 8B model: an evaluator occasionally lists a "missing point" the answer did cover, or credits the candidate with a point that came from the knowledge base; very weak answers can get 0 on every dimension. Treat scores as practice signals.

**Tested with the mocked/scripted provider only** (fast, deterministic, no model): all backend Jest suites (`aiClient` mocked), the AI-service pytest suite (`tests/stub_provider.py`), and frontend Vitest. They verify API behaviour, validation, error translation, state transitions and schema repair, not model quality.

---

## API overview

All routes are under `/api`; everything except `health`, `register` and `login` requires `Authorization: Bearer <jwt>`. Errors have the shape `{ "error": { "code", "message", "details?" } }`.

| Method & path | Description |
|---|---|
| `GET /health` | DB, AI service, provider, vector store, code-runner status |
| `POST /auth/register` · `POST /auth/login` · `GET /auth/me` · `POST /auth/change-password` | auth |
| `GET/PATCH/DELETE /users/me` | profile; delete requires password and erases all user data |
| `GET/POST /resumes` · `GET/DELETE /resumes/:id` · `POST /resumes/:id/reanalyze` | multipart field `resume` |
| `GET/POST /jobs` · `GET/DELETE /jobs/:id` · `POST /jobs/:id/reanalyze` | |
| `POST /jobs/:id/match` `{resumeId}` · `GET /jobs/:id/matches` | match analysis |
| `GET/POST /interviews` · `GET/DELETE /interviews/:id` | list supports `page`, `limit`, `status` |
| `POST /interviews/:id/answer` `{answer}` | evaluate + next question / follow-up |
| `POST /interviews/:id/next` · `/complete` · `/abandon` · `GET /interviews/:id/report` | |
| `GET /coding/problems` · `GET /coding/problems/:slug` | hidden tests never returned |
| `POST /coding/problems/:slug/submit` `{code, mode: run\|submit}` · `GET /coding/problems/:slug/submissions` | |
| `GET /coding/submissions/:id` · `POST /coding/submissions/:id/explain` | |
| `GET /knowledge` · `GET /knowledge/status` · `GET /knowledge/:docId` · `POST /knowledge/search` | |
| `POST /knowledge` · `POST /knowledge/reindex` · `DELETE /knowledge/:docId` | admin only |
| `GET /dashboard` | aggregated stats |

**AI service** (internal; `X-Internal-Token` required when configured; OpenAPI docs at `/docs` outside production):
`GET /health`, `POST /resume/analyze`, `POST /job/analyze`, `POST /match/analyze`, `POST /interview/question`, `POST /interview/evaluate`, `POST /interview/follow-up`, `POST /interview/report`, `POST /coding/explain`, `POST /rag/ingest`, `POST /rag/retrieve`, `GET /rag/stats`, `DELETE /rag/documents/{id}`, `POST /embeddings`. Every request and response is a Pydantic model; requests reject unknown fields.

---

## Security

- **Passwords:** bcrypt (12 rounds by default), never returned (`select:false` + `toJSON` transform), 72-byte limit enforced, letter+digit rule.
- **Sessions:** HS256 JWT containing only the user id (`sub`); algorithm pinned; the user is reloaded from MongoDB on every request; tokens issued before a password change are rejected.
- **Generic auth errors:** the same "Invalid email or password" for unknown emails and wrong passwords, with a dummy bcrypt compare to equalise timing.
- **Authorization:** every query includes `user: req.user._id`; other users' resources return 404 (existence is not revealed); knowledge-base management requires `role: admin` (403), and roles cannot be set via the API.
- **Input validation:** zod schemas (strict objects, bounded strings) for body/params/query; Pydantic on the AI service.
- **NoSQL injection:** request keys starting with `$`, containing `.`, or named `__proto__/constructor/prototype` are rejected (400); Mongoose `sanitizeFilter` wraps any operator that reaches a filter; `strictQuery` drops unknown filter fields; intentional operators are marked with `mongoose.trusted()`.
- **Uploads:** PDF extension + MIME check *and* `%PDF-` magic-byte check, 5 MB limit, 1 file, random temp filename in a private temp dir, always deleted in `finally`, display name sanitised, max 10 pages parsed.
- **HTTP hardening:** `helmet`, CORS allow-list, `x-powered-by` off, 100 kB JSON limit, rate limits (auth 20/15 min/IP, AI 20/min/user, code 10/min/user, global 300/min).
- **Errors:** centralised handler; only `AppError` messages reach clients; no stack traces; AI-service internals (validation issues, tracebacks, token problems) are logged, not shown.
- **Service-to-service:** the AI service requires `X-Internal-Token` (constant-time compare) and refuses to start in production without it.
- **Prompt injection:** untrusted text is wrapped in tags the model is told to treat as data; outputs are schema-validated and cross-checked (e.g. projects must exist on the resume).
- **Code execution:** never in the Node process — see below.
- **Secrets:** only `.env.example` files are committed; `.gitignore` covers `.env*`; `npm run check:secrets` scans for key-like strings. The frontend stores the JWT in `localStorage` (trade-off: simpler, survives reloads, but readable by injected scripts — mitigated by never rendering untrusted HTML; `RichText` renders formatting without `dangerouslySetInnerHTML`).

### Code-execution sandbox (read this)

`CODE_RUNNER=process` (default, local development): code is written to a fresh temp dir, compiled with `g++` in a child process (argument array, no shell), and each test runs as a separate process with an **empty environment**, **wall-clock timeout + SIGKILL of the process group**, **`prlimit`** CPU / address-space (256 MB) / file-size (1 MB) / open-file / core limits, **no network** via a Linux network namespace (`unshare -rn`) when available, 64 kB output cap, and at most 2 concurrent judges. On macOS/Windows `prlimit`/`unshare` are unavailable and only the timeout/output limits apply. **On Windows in particular there is no network or memory isolation**: submitted programs can open sockets and read any file the server's user can read. On Windows the child environment contains only the compiler's own directory, the system directory and `SystemRoot` (MinGW needs them to find `cc1plus`/`ld` and its runtime DLLs), and program output is normalised from CRLF to LF.

**This is a best-effort local sandbox, not a security boundary for untrusted multi-tenant production.** The program still runs as the server's user and can read files that user can read. For that reason the process runner is **refused when `NODE_ENV=production`** unless explicitly overridden. `CODE_RUNNER=docker` adds a disposable container per run (`--network none`, memory and PID limits, read-only root, dropped capabilities, `nobody` user). For real production use a dedicated judge (e.g. Judge0, isolate/nsjail on a separate host, or Firecracker microVMs). The Render blueprint sets `CODE_RUNNER=disabled`.

---

## Deployment architecture

```text
Vercel (frontend, static SPA)  ──►  Render web service: prepai-backend (Node)  ──►  MongoDB Atlas
                                            │
                                            └──►  Render web service: prepai-ai-service (Python)  ──►  LLM API
```

Nothing is deployed automatically. Configuration is prepared:

- **Vercel:** `frontend/vercel.json` (Vite build, SPA rewrites, security headers, immutable asset caching). Set the project root to `frontend/` and `VITE_API_URL=https://<your-backend>.onrender.com`.
- **Render:** `render.yaml` blueprint defines both services with health checks. Secrets are `sync: false` (set in the dashboard); `JWT_SECRET` is generated. Set `CLIENT_URL` to your Vercel URL, `AI_SERVICE_URL` to the AI service URL and the same `AI_SERVICE_TOKEN` on both.
- **AI service on Render:** Ollama needs a GPU host, so production typically uses an API provider. The vector index lives on local disk: attach a persistent disk at `/var/data`, or rely on the backend's startup re-index from MongoDB (it re-embeds 13 documents, a few seconds and a few cents with an API embedder). See [Rebuilding the vector index](#rebuilding-the-vector-index) for the first deploy and for AI-service-only restarts.
- **MongoDB Atlas:** see [MongoDB setup](#mongodb-setup).
- No production domains are hard-coded anywhere.

---

## Known limitations

- **LLM hallucination:** questions, feedback and model answers can be wrong or overconfident. Retrieval grounding, schema validation and cross-checks reduce this but cannot eliminate it; the UI says so.
- **Evaluation subjectivity:** rubric scores from a model are not ground truth and vary between runs and models (temperature 0.1 reduces variance). Treat scores as practice signals, not assessments.
- **Model-dependent quality:** small local models (7–8B) follow the JSON format reliably with `format: json`, but their technical judgement is weaker than large hosted models.
- **Retrieval quality:** the knowledge base is 13 hand-written documents (143 chunks). With the `hash` embedder retrieval is lexical only; semantic embeddings are recommended. There is no re-ranking.
- **Token/cost:** each answer costs ~2 LLM calls (evaluation + next question), plus one per report. Inputs are truncated (resume ≤ 14k chars, context ≤ 3.5k chars) to bound cost/latency; local models can take 10–60 s per call.
- **Resume parsing:** text-based PDFs only (no OCR for scanned resumes); multi-column layouts may extract in an odd order. Heuristic mode extracts skills only.
- **Coding sandbox:** see above — local process runner is not production-grade isolation; only C++ is supported.
- **Sessions:** JWT in localStorage, no refresh-token rotation or server-side revocation list (password change does revoke older tokens).
- **Dashboard aggregation** is computed in application code from per-user queries — fine for per-user volumes, would move to aggregation pipelines/pre-computed stats at scale.

## Future improvements

- Streaming responses (SSE) for evaluations and questions; background jobs (BullMQ) for slow analyses.
- Voice mode (speech-to-text answers, spoken questions) and timed rounds.
- Hybrid retrieval (BM25 + vectors) with a cross-encoder re-ranker; user-uploaded study material per account; Qdrant/Pinecone store.
- Prompt/response caching and per-user token budgets; LLM-as-judge calibration against human-graded answers.
- More languages for the judge (Python, Java, JS) via a dedicated Judge0/nsjail service; complexity analysis from runtime profiling.
- HttpOnly refresh-token cookies with rotation; email verification and password reset; audit log.
- Playwright E2E tests in CI; OpenTelemetry tracing across the three services.

---

## How I would explain this project in an interview

**The one-liner.** "PrepAI is a RAG-backed mock-interview platform: a React SPA, an Express API that owns users and interview state, and a stateless FastAPI service that owns everything LLM-related behind a provider interface. The model never touches the database directly, and nothing it returns is trusted without validation."

**Why is FastAPI separate from Node?** The Python ecosystem is where the AI tooling is (Pydantic, Chroma, NumPy, model SDKs). Separating it gives a clean boundary: the Node API handles auth, authorization, persistence and the interview state machine; the AI service is stateless — it receives compact context and returns validated JSON — so it can scale independently, be swapped or be rate-limited separately, and a slow model call never blocks unrelated API traffic. It is protected by a shared internal token so it is never publicly callable.

**Why RAG?** A general model's technical explanations drift and it has no notion of "our curriculum". Retrieving the most relevant study-note passages and putting them in the prompt grounds questions and feedback in vetted content, lets the UI show *which* material was used, and lets me update knowledge by editing documents instead of retraining. It also keeps prompts small: top-k chunks instead of the whole corpus.

**Why embeddings?** To retrieve by meaning rather than exact words — "each thread holds a lock the other needs" should find the "circular wait" section. Documents are chunked with heading context, embedded once at ingestion, and the query is embedded at request time; cosine similarity ranks chunks. Each embedding model has its own collection because vectors from different models are not comparable.

**How does retrieval work concretely?** The backend builds a query from the category, role, the job's skills in that category and the points the candidate missed last time. The AI service embeds it, runs a top-k cosine search in Chroma filtered by topic metadata, excludes chunks already used in this session for variety, drops low-similarity hits, and formats `[S1] (title › section)` blocks capped at ~3,500 characters. The chunk metadata travels back to the UI as "Grounded in …".

**How does the provider abstraction work?** An `AIProvider` interface with `generate`, `generate_json`, `embed` and `health_check`. `OllamaProvider` and an OpenAI-compatible `APIProvider` (OpenAI, Gemini, Groq, OpenRouter via presets/base URL) implement only transport; the JSON-validation logic lives in the base class so every provider behaves the same. A factory reads `AI_PROVIDER` from the environment, and services receive the provider through a dependency container — which is also how tests inject a scripted provider.

**How are hallucinations reduced?** (1) Grounding with retrieved context and instructions to use it; (2) deterministic code for anything that must be exact — skill matching, coverage %, weighted scores, report statistics; (3) cross-checks on outputs — only projects that exist on the resume are kept, repeated questions are rejected; (4) low temperature for evaluation; (5) honest UI labelling: "AI analysis" vs "Keyword-based", and disclaimers that scores can be wrong.

**How are structured outputs validated?** JSON mode at the provider, then a tolerant extractor, then Pydantic schemas with field types that normalise harmless drift (string→list, "8/10"→8, clamping, deduplication, truncation, dropping unknown keys) but reject structural errors. On failure the model gets one repair prompt with the exact validation errors; after that the request fails with 502 rather than storing garbage. Recorded messy-output fixtures test this.

**How is user data protected?** bcrypt hashes never leave the DB; JWTs carry only the user id and the user is reloaded on every request; every query is scoped by user id and cross-user access returns 404; zod validation plus operator-key rejection plus Mongoose `sanitizeFilter` against NoSQL injection; PDFs are signature-checked and temp files deleted; only compact structured summaries (not raw resumes) are sent to the model; users can delete everything. Secrets come only from the environment and a script scans the repo.

**How are AI failures handled?** Each failure type maps to a specific status: provider unreachable or model missing → 503 with an actionable message ("run `ollama pull …`"), unusable output → 502, timeout → 504. Analyses degrade to deterministic keyword results with a visible warning. In the interview, a failed evaluation saves nothing and keeps the user's draft; a failed next question keeps the saved evaluation and offers "Generate next question". The health endpoints report provider and model availability so problems are visible before a user hits them.

**What I would do next / trade-offs I chose.** Embedding interview turns in the session document (bounded, always read together) instead of a separate collection; a small context snapshot per session so deleting a resume doesn't break history; JWT in localStorage for simplicity with its XSS trade-off acknowledged; a local process sandbox for development with production explicitly refused. Next steps would be streaming, a dedicated judge service, hybrid retrieval with re-ranking, and calibrating the evaluator against human-graded answers.

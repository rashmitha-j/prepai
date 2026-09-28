# PrepAI AI Service

Stateless FastAPI service that owns everything LLM-related for PrepAI: the provider abstraction, prompts, schema-validated structured output, deterministic skill matching and scoring, and the RAG pipeline (chunking, embeddings, vector store, retrieval). It is called only by the Node backend (see the root `README.md` for the full architecture).

## Layout

```text
app/
  main.py              create_app(): lifespan builds the dependency container
  api/routes.py        HTTP endpoints (thin: validate → service → schema)
  core/                config (env), errors → HTTP, internal-token security, DI container, JSON extraction
  models/              Pydantic request/response + LLM output schemas, sanitising field types
  providers/           AIProvider base, OllamaProvider, APIProvider (OpenAI-compatible), HashingEmbedder, factory
  rag/                 loaders, cleaning, chunking, vector_store (Chroma / local NumPy), pipeline, cli
  services/            analysis (resume/job/match), interview (question/evaluate/follow-up/report), coding, prompts, skills
tests/                 pytest suites, fixtures, scripted test provider, stub server
```

## Run

```bash
python -m venv .venv && source .venv/bin/activate      # Windows: .venv\Scripts\activate
pip install -r requirements.txt -r requirements-dev.txt
cp .env.example .env                                  # set OLLAMA_MODEL or an API provider
uvicorn app.main:app --reload --port 8000
```

`GET /health` reports provider reachability, whether the configured model is pulled, the embedding model and vector-store size. Interactive docs: http://localhost:8000/docs (disabled in production).

## Endpoints

| Endpoint | Purpose |
|---|---|
| `GET /health` | liveness + provider/model/vector-store status (no token needed) |
| `POST /resume/analyze` | resume text → skills, technologies, projects, experience, education, strengths, gaps |
| `POST /job/analyze` | job text → required/preferred skills, responsibilities, technologies, level |
| `POST /match/analyze` | deterministic skill overlap + coverage, LLM narrative (projects validated against resume) |
| `POST /interview/question` | RAG-grounded next question, adapted to history; returns sources |
| `POST /interview/evaluate` | rubric scores (overall computed in code), strengths, missing points, model answer, follow-up suggestion |
| `POST /interview/follow-up` | follow-up question probing the previous answer |
| `POST /interview/report` | computed statistics + summary, gaps, roadmap (heuristic fallback if provider is down) |
| `POST /coding/explain` | explanation of a judged C++ submission |
| `POST /rag/ingest`, `POST /rag/retrieve`, `GET /rag/stats`, `DELETE /rag/documents/{id}` | knowledge base |
| `POST /embeddings` | raw embeddings from the configured embedder |

When `AI_SERVICE_TOKEN` is set, every endpoint except `/health` requires the `X-Internal-Token` header. It is mandatory when `ENVIRONMENT=production`.

## Error contract

| Status | Code | Meaning |
|---|---|---|
| 503 | `AI_PROVIDER_UNAVAILABLE` | provider unreachable, model not pulled, bad credentials, quota — message says how to fix it |
| 502 | `AI_PROVIDER_ERROR` / `AI_OUTPUT_INVALID` | provider error, or output still invalid after one repair attempt |
| 422 | `VALIDATION_ERROR` | request failed Pydantic validation |
| 500 | `INTERNAL_ERROR` | unexpected; details only in logs |

Resume/job/match analysis and reports degrade to deterministic results (`analysisMode: "heuristic"` + `warnings`) instead of failing.

## RAG CLI

```bash
python -m app.rag.cli ingest ../backend/src/seed/knowledge
python -m app.rag.cli search "what causes a deadlock" --topic os -k 3
python -m app.rag.cli stats
```

Normally the Node backend ingests documents from MongoDB (the source of truth) and re-indexes automatically on startup. The AI service also indexes any document from `RAG_BOOTSTRAP_DIR` missing from the index when it starts, so an AI-service restart with a wiped disk heals itself.

## Tests

```bash
python -m pytest -q          # no model or network needed
python -m ruff check app tests
PREPAI_LIVE_AI=1 python -m pytest tests/test_eval_fixtures.py -s   # evaluate the configured real model
```

`tests/stub_provider.py` is a scripted provider returning canned JSON — **not an AI model** — used to test the plumbing. `python -m tests.run_stub_server --port 8000` runs the whole service with it for end-to-end UI testing without a model; its `/health` reports provider `scripted-test`.

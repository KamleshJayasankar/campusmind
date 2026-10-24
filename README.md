# CampusMind

An AI assistant that answers student questions from official college documents, **with cited sources**. If the documents do not contain the answer, it says so instead of guessing.

![CI](https://github.com/KamleshJayasankar/campusmind/actions/workflows/ci.yml/badge.svg)

**Live demo: https://campusmind-rho.vercel.app**

> The API runs on a free hosting plan that sleeps when idle, so the first request after a pause can take about a minute. The demo contains one fictional sample document (library rules). Create an account to try it: new accounts are students and can ask questions. Uploading documents is limited to faculty and admins.

Try asking: *How many books can a student borrow at a time?*, *What is the late fee for an overdue book?*, *Is food allowed in the library?* and, for a question the document cannot answer, *What is the hostel fee?*

## Screenshots

![Chat with cited sources](docs/screenshots/chat.png)

![Document upload and processing status](docs/screenshots/documents.png)

## Features

- **Cited answers.** Every answer shows the document, page and match score it came from. When nothing relevant is found, it refuses instead of inventing an answer.
- **Semantic search.** Finds the right passage even when the question uses different words than the document.
- **Scanned PDFs.** If a PDF has no text layer, the pages are read with OCR (Gemini) before indexing.
- **Roles and departments.** Student, faculty and admin roles. Documents are private to a department or visible to the whole college, enforced in the database query.
- **Background ingestion.** Uploads return immediately; a worker extracts, chunks, embeds and stores the text, and the UI shows the status live.
- **Protection.** JWT authentication, bcrypt password hashing, input validation, Redis rate limiting and a Redis answer cache.
- **Private chat history** for each user.
- **Engineering practice.** 38 automated tests, GitHub Actions CI and a scored evaluation set.

## How it works

```mermaid
flowchart LR
    U[Browser] --> W[Next.js web app<br/>Vercel]
    W --> A[Express API<br/>Render]
    A --> P[(PostgreSQL + pgvector<br/>Neon)]
    A --> R[(Redis<br/>cache, rate limits, job queue)]
    A --> G[Gemini API<br/>embeddings and answers]
    R --> K[Ingestion worker<br/>BullMQ]
    K --> P
    K --> G
```

**When a document is uploaded**

1. The API checks the user's role, saves the PDF and queues a job, then replies immediately.
2. The worker extracts the text page by page, using OCR if the PDF is scanned.
3. The text is split into chunks of up to 1000 characters with a 150 character overlap.
4. Each chunk is turned into a 768-number embedding with Gemini and stored in PostgreSQL (pgvector), all inside one transaction.
5. The document becomes `ready`, and the answer cache is invalidated.

**When a student asks a question**

1. The API checks the login and the rate limit, then looks in the Redis cache.
2. On a miss, the question is embedded and PostgreSQL returns the 5 most similar chunks from documents the student is allowed to see.
3. If the best match is below the similarity threshold, the answer is "I couldn't find this in the uploaded documents" and the model is never called.
4. Otherwise Gemini answers using only those chunks and cites them as [1], [2]. The model is also told to refuse if the answer is not in the excerpts.
5. Only the sources the answer cites are returned. The answer is cached and saved to the user's chat history.

## Tech stack

| Area | Technology |
|---|---|
| Frontend | Next.js, React, TypeScript, Tailwind CSS |
| API | Node.js, Express, TypeScript, Zod |
| Database | PostgreSQL with pgvector (HNSW index, cosine distance) |
| Queue, cache, rate limits | Redis, BullMQ |
| AI | Gemini API: embeddings, answer generation, OCR |
| Testing | Vitest, Supertest |
| CI | GitHub Actions |
| Hosting | Vercel (web), Render (API and worker), Neon (database), Redis Cloud |

## Evaluation

`apps/api/eval` contains a 44-question set (34 answerable, 10 unanswerable) and a script that runs every question through the real retrieval and the real model.

| Measure | Result |
|---|---|
| Retrieval hit rate (right document in the top 5) | 29/29 (100%) |
| Answer accuracy (expected facts appear in the answer) | 34/34 (100%) |
| Correct refusals on unanswerable questions | 10/10 (100%) |
| Average time per question | about 2 seconds |

**Read these numbers with care.** The questions were written by the author from the documents, an answer counts as correct when expected keywords appear, and the document set is small. It shows the pipeline works and refuses well, not how it would perform on real student questions. The documents used are not included in this repository. Adding questions written by real students is the next step.

Rerun it with `npm run eval --workspace api -- --dept csbs`.

## Testing and CI

- 38 tests: chunking, authentication, document upload and access, chat (access control, caching, refusals, history, rate limiting), OCR and proxy handling.
- Tests call the real HTTP API against a separate `campusmind_test` database. Gemini, the queue and embeddings are replaced with fakes, so tests are fast, free and repeatable. The test helpers refuse to run on a database whose name does not contain `_test`.
- GitHub Actions starts Postgres (pgvector) and Redis, then runs the typecheck and tests for the API and the lint and build for the web app on every push.

## Run it locally

Requirements: Node.js 22, Docker, and a free Gemini API key from Google AI Studio.

```bash
git clone https://github.com/KamleshJayasankar/campusmind.git
cd campusmind
npm install
docker compose up -d
```

Create `apps/api/.env`:

```
PORT=4000
DATABASE_URL=postgres://campusmind:campusmind@127.0.0.1:5433/campusmind
REDIS_URL=redis://127.0.0.1:6379
JWT_SECRET=replace-with-a-long-random-string
GEMINI_API_KEY=your-gemini-api-key
EMBEDDING_MODEL=gemini-embedding-001
GENERATION_MODEL=gemini-3.1-flash-lite
MIN_SCORE=0.55
```

Create `apps/web/.env.local`:

```
NEXT_PUBLIC_API_URL=http://localhost:4000
```

Create the tables and a department (the local database uses port 5433 so it does not clash with a Postgres already on your machine):

```bash
docker compose exec -T db psql -U campusmind -d campusmind -v ON_ERROR_STOP=1 < apps/api/db/001_init.sql
docker compose exec db psql -U campusmind -d campusmind -c "INSERT INTO departments (name, slug) VALUES ('Computer Science and Business Systems', 'csbs');"
```

Start the three processes, each in its own terminal:

```bash
npm run dev --workspace api
npm run worker --workspace api
npm run dev --workspace web
```

Open http://localhost:3000 and register. New accounts are students. To upload documents, promote yourself to admin and log in again:

```bash
docker compose exec db psql -U campusmind -d campusmind -c "UPDATE users SET role = 'admin' WHERE email = 'you@example.com';"
```

Run the tests:

```bash
docker compose exec db psql -U campusmind -d campusmind -c "CREATE DATABASE campusmind_test;"
docker compose exec -T db psql -U campusmind -d campusmind_test < apps/api/db/001_init.sql
npm test --workspace api
```

## Deployment

| Part | Service | Notes |
|---|---|---|
| Web app | Vercel | `NEXT_PUBLIC_API_URL` points to the API |
| API and worker | Render (free plan) | The worker runs in the same process (`RUN_WORKER=true`) because the free plan has no separate worker service |
| Database | Neon | Pooled connection string, pgvector enabled |
| Redis | Redis Cloud | Queue, cache and rate-limit counters |

API environment variables: `DATABASE_URL`, `REDIS_URL`, `JWT_SECRET`, `GEMINI_API_KEY`, `EMBEDDING_MODEL`, `GENERATION_MODEL`, `MIN_SCORE`, `CORS_ORIGIN`, `RUN_WORKER`, `NODE_VERSION`.

Free-tier trade-offs: the API sleeps after 15 minutes idle; Render's disk is wiped on restart, so original PDFs are not kept (the extracted text and embeddings live in Neon, so answers keep working); and Gemini's free quota limits how much can be indexed, which is why answers are cached and requests are rate limited.

## Design decisions

- **PostgreSQL with pgvector instead of a separate vector database.** One system to run, transactions, and joins for access control. Enough speed at this scale.
- **Two guards against wrong answers.** A similarity threshold, and a prompt that makes the model refuse when the excerpts do not contain the answer. Similarity scores for relevant and irrelevant questions can overlap, so the second guard matters.
- **Cache invalidation with a version number.** Cache keys include a documents version that changes whenever a document is processed, so old answers are never reused after the documents change.
- **Fail-open Redis.** If Redis is down, caching and rate limiting are skipped and the app keeps working.
- **Access control in the SQL itself.** Retrieval only ever sees the user's department plus college-wide documents, and a test checks it.

## Limitations and roadmap

- Answers are not streamed, and each question is answered on its own without earlier chat messages.
- No admin analytics or feedback buttons yet (the database already has a feedback column).
- Tables inside PDFs extract poorly, OCR can misread, and very long scanned PDFs may be cut off.
- The login token is stored in `localStorage`. httpOnly cookies would be safer.
- Only the embedding step sits behind an interface. Answer generation and OCR call Gemini directly.
- Prompt-injection protection is partial: the prompt tells the model to ignore instructions inside documents.

## Project structure

```
apps/
  api/
    src/             Express app, auth, documents, chat, ingestion, AI clients, queue, worker
    db/001_init.sql  database schema
    tests/           38 tests
    eval/            evaluation questions and scoring script
    scripts/         reprocess failed documents
  web/               Next.js app (login, chat, documents)
docker-compose.yml   local Postgres (pgvector) and Redis
.github/workflows/   CI
```

## Author

Kamlesh J, B.Tech Computer Science and Business Systems, Easwari Engineering College.
GitHub: [KamleshJayasankar](https://github.com/KamleshJayasankar)

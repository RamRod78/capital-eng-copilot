# Capital Engineering Copilot 🏗️

An AI-powered engineering knowledge extraction, vector retrieval, Subject Matter Expert (SME) validation, and RFP/SOW generation system built with **TypeScript**, **React**, **Vite**, **TanStack Query & Table**, **Hono**, **Drizzle ORM**, **Google Gemini**, and **PostgreSQL with pgvector**.

---

## 🎯 Executive Overview & Vision

In Capital Engineering and EPC (Engineering, Procurement, Construction) projects, engineering standards, guidelines, vendor specifications, and FEED documents often live in fragmented, unstructured formats. 

**Capital Engineering Copilot** transforms this unstructured knowledge base into an active, governed engineering asset:
1. **Intelligent Ingestion & Extraction**: Automatically parses requirements, recommendations, and guidelines from multi-format engineering documents (PDF, Word, Excel, CSV, Text), scoring extraction confidence and tagging disciplines and document owners.
2. **Confidence-Gated SME Review**: Low-confidence (< 0.85) or cross-discipline items are routed directly to assigned Subject Matter Experts (SMEs) and document owners for review, refinement, and validation.
3. **Hybrid Knowledge Base**: Stored in a unified knowledge store combining Relational Metadata (owners, audit history, compliance status) and Vector Embeddings (`pgvector` for dense semantic search).
4. **Project Scoping & RFP Generator Agent**: Ingests new capital project preliminary scopes, matches all applicable mandatory requirements, recommendations, and guidelines, and drafts a vendor-ready RFP / Scope of Work (SOW) package with 1-click Markdown and CSV export.
5. **Closed-Loop "Lessons Learned" Engine**: Feedback from human reviews and project scoping feeds back into agent memory and flags upstream source documents for revisions.

---

## 🛠️ Technology Stack (Approved Tech Stack)

Strictly conforming to [`.antigravity/techstack.md`](file:///.antigravity/techstack.md):

| Layer | Technology |
| :--- | :--- |
| **Language & Toolchain** | TypeScript 5+, Vite 6+, Node 22/24 |
| **Frontend Framework** | React 18, React Router v6, TailwindCSS |
| **Client State & Tables** | TanStack Query v5, TanStack Table v8 |
| **Client Forms & Validation** | React Hook Form, Zod isomorphic schemas |
| **Backend API** | Hono (`@hono/node-server`) with Zod validation |
| **Database & ORM** | Drizzle ORM, PostgreSQL with `pgvector` |
| **AI & Embeddings** | `@google/genai` (Gemini 2.5 Flash, `text-embedding-004`) |
| **File Parsing** | `pdf-parse`, `mammoth` (DOCX), `xlsx` (Excel/CSV) |
| **Testing** | Vitest, Testing Library |
| **Base Image** | `node:22-alpine` (multi-stage production container) |

---

## 📁 Repository Layout

```
capital-eng-copilot/
├── .antigravity/
│   └── techstack.md             # Organizational approved tech stack
├── docker/
│   ├── docker-compose.yml       # Stack configuration (pgvector + Node container)
│   └── init.sql                 # PostgreSQL + pgvector schema
├── src/
│   ├── shared/
│   │   └── schemas.ts           # Isomorphic Zod models & TypeScript types
│   ├── server/                  # Hono TypeScript Backend
│   │   ├── index.ts             # Server entrypoint (@hono/node-server)
│   │   ├── db/                  # Drizzle ORM schema and pg connection
│   │   ├── routes/              # Ingest, Extractions, Scoping, Feedback, Search, Stats
│   │   └── services/            # Gemini client & multi-format file parsers
│   └── client/                  # React + Vite + TanStack SPA
│       ├── index.html
│       └── src/
│           ├── main.tsx         # React root + QueryClient + Router
│           ├── App.tsx          # App shell & sidebar navigation
│           ├── api/client.ts    # Typed fetch API client
│           └── pages/           # Dashboard, IngestExtract, ReviewQueue, ProjectScoping, LessonsLearned, KnowledgeSearch
├── tests/                       # Vitest test suite
│   ├── schemas.test.ts
│   ├── parsers.test.ts
│   └── scoping.test.ts
├── Dockerfile                   # Multi-stage Alpine Node container
├── package.json
├── tsconfig.json
├── vite.config.ts
└── vitest.config.ts
```

---

## 🚀 Quickstart & Development

### 1. Install Dependencies
```bash
npm install
```

### 2. Run Locally in Development
```bash
# Start backend server and Vite client concurrently
npm run dev
```
Client: `http://localhost:5173` | Server API: `http://localhost:3000`

### 3. Run Test Suite
```bash
npm test
```

### 4. Build Production Bundle
```bash
npm run build
```

---

## 🐳 Docker Deployment (Portainer / Docker Compose)

```bash
docker compose -f docker/docker-compose.yml up -d --build
```
Access the application at `http://<HOST_IP>:8501`.

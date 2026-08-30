# Capital Engineering Copilot 🏗️

An AI-powered engineering knowledge extraction, vector & graph retrieval, Subject Matter Expert (SME) validation, and RFP/SOW generation system built with **Google Gemini**, **PostgreSQL with pgvector**, and **Streamlit**.

---

## 🎯 Executive Overview & Vision

In Capital Engineering and EPC (Engineering, Procurement, Construction) projects, engineering standards, guidelines, vendor specifications, and FEED documents often live in fragmented, unstructured formats. 

**Capital Engineering Copilot** transforms this unstructured knowledge base into an active, governed engineering asset:
1. **Intelligent Ingestion & Extraction**: Automatically parses requirements, recommendations, and guidelines from engineering documents, scoring extraction confidence and tagging disciplines and document owners.
2. **Confidence-Gated SME Review**: Low-confidence or cross-discipline items are routed directly to assigned Subject Matter Experts (SMEs) and document owners for review, refinement, and validation.
3. **Hybrid Knowledge Base**: Stored in a triple-model knowledge store combining Relational Metadata (owners, audit history, compliance status), Vector Embeddings (`pgvector` for semantic search), and Knowledge Graph relationships (systems ↔ standards ↔ disciplines).
4. **Project Scoping & RFP Generator Agent**: Ingests new capital project preliminary scopes, matches all applicable mandatory requirements, recommendations, and guidelines, and drafts a vendor-ready RFP / Scope of Work (SOW) package.
5. **Closed-Loop "Lessons Learned" Engine**: Feedback from human reviews and project scoping feeds back into agent memory and flags upstream source documents for revisions.

---

## 🗺️ Project Delivery Milestones

```mermaid
flowchart LR
    M1["Milestone 1<br/>Ingestion & SME Review"] --> M2["Milestone 2<br/>Hybrid Knowledge Store"]
    M2 --> M3["Milestone 3<br/>Project Scoping & RFP Agent"]
    M3 --> M4["Milestone 4<br/>Lessons Learned Loop"]
```

| Milestone | Objective | Key Deliverables | Status |
| :--- | :--- | :--- | :--- |
| **Milestone 1** | **Ingestion & Confidence-Driven Review** | Multi-type extraction (Requirements, Recommendations, Guidelines), confidence scoring, document owner assignment, multi-discipline SME review queue. | 🚀 In Progress |
| **Milestone 2** | **Hybrid Knowledge Store (Relational + Vector + Graph)** | PostgreSQL + `pgvector` indexing, graph relations across equipment systems and standards, document versioning. | 📋 Planned |
| **Milestone 3** | **Project Scoping & Automated RFP Agent** | Project scope intake, intelligent requirement matching, human curation interface, and formatted RFP/SOW export (DOCX/Markdown/Excel). | 📋 Planned |
| **Milestone 4** | **Closed-Loop Feedback & Lessons Learned** | Review memory updates, source document revision flags, and SME notification queue. | 📋 Planned |

---

## 📁 Repository Layout & Modular Architecture

```
capital-eng-copilot/
├── .antigravity/
│   └── rules.md                # System instructions for the Antigravity agent
├── docker/
│   ├── docker-compose.yml       # Stack configuration for Portainer / Docker Compose
│   └── init.sql                 # Schema definition (relational, pgvector, graph relations)
├── src/
│   ├── app.py                   # Streamlit multi-page portal entrypoint
│   ├── config.py                # Environment settings & Pydantic configuration
│   ├── models.py                # Domain data models (Extractions, Scopes, Reviews)
│   ├── extract.py               # Gemini extraction worker with confidence scoring
│   ├── rag.py                   # Vector search & semantic similarity matching
│   ├── scoping/                 # Milestone 3: Scoping agent & RFP generator
│   │   ├── agent.py
│   │   └── exporter.py
│   ├── feedback/                # Milestone 4: Lessons learned & document revision flags
│   │   └── loop.py
│   └── pages/                   # Streamlit Multi-Page UI
│       ├── 1_📥_Ingest_&_Extract.py
│       ├── 2_📋_SME_Review_Queue.py
│       ├── 3_🎯_Project_Scoping_&_RFP.py
│       ├── 4_💡_Lessons_Learned.py
│       └── 5_🔍_Knowledge_Explorer.py
├── tests/
│   ├── test_extract.py          # Extraction and chunking tests
│   ├── test_models.py           # Schema and validation tests
│   └── test_review_queue.py     # Review and status transition tests
├── .env.example
├── .gitignore
├── Dockerfile                   # Multi-stage production container
├── requirements.txt
└── README.md
```

---

## ⚡ Core Capabilities

1. **Multi-Classification Extraction**: Extracts concrete items into **Mandatory Requirements** (*shall/must*), **Recommendations** (*should/preferred*), and **Optional Guidelines** (*may/optional*).
2. **Confidence-Gated SME Routing**: Items with confidence below threshold ($\lt 0.85$) or conflicting disciplines are routed to designated document owners and discipline SMEs.
3. **Vector Similarity & Duplicate Detection**: Cosine similarity via `pgvector` (`text-embedding-004`) to prevent duplicate specifications and surface related clauses.
4. **Project Scoping & Vendor RFP Export**: Assembles curated technical scopes of work formatted for external EPC and engineering service providers.
5. **Continuous Learning Loop**: Feedback from SME reviews updates agent prompt context and flags obsolete engineering standards for owner revision.

---

## 🚀 Getting Started

### 1. Prerequisites
- Python 3.11+
- Docker & Docker Compose (or Portainer)
- Google Gemini API Key

### 2. Configure Environment Variables
Copy `.env.example` to `.env` and fill in your Gemini API key:
```bash
cp .env.example .env
```
Edit `.env`:
```ini
GEMINI_API_KEY=your_actual_gemini_api_key
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/capital_eng
```

### 3. Deploying with Docker Compose / Portainer

#### Running locally with Docker Compose:
```bash
cd docker
docker compose up -d
```
Access the application at: `http://localhost:8501`

#### Deploying in Portainer:
1. Navigate to **Stacks** > **Add stack**.
2. Select repository or paste `docker/docker-compose.yml`.
3. Provide environment variables (`GEMINI_API_KEY`, etc.) in the stack environment config.
4. Click **Deploy the stack**.

---

## 🛠️ Local Development Setup

```bash
# 1. Create and activate a virtual environment
python -m venv .venv
source .venv/bin/activate  # On Windows: .venv\Scripts\activate

# 2. Install dependencies
pip install -r requirements.txt

# 3. Start PostgreSQL with pgvector (via Docker)
docker run -d --name pgvector-local \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=capital_eng \
  -p 5432:5432 \
  -v $(pwd)/docker/init.sql:/docker-entrypoint-initdb.d/init.sql \
  pgvector/pgvector:pg16

# 4. Launch Streamlit UI
streamlit run src/app.py
```

---

## 📄 License
Internal use only. Capital Engineering Copilot.

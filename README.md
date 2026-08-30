# Capital Engineering Copilot 🏗️

An AI-powered engineering and RFP extraction, vector search, and Subject Matter Expert (SME) validation system built with Google Gemini, PostgreSQL with pgvector, and Streamlit.

---

## 📁 Repository Layout

```
capital-eng-copilot/
├── .antigravity/
│   └── rules.md                # System instructions for the Antigravity agent
├── docker/
│   ├── docker-compose.yml       # Stack configuration for Portainer / Docker Compose
│   └── init.sql                 # Schema definition with pgvector
├── src/
│   ├── app.py                   # Streamlit SME review interface
│   ├── config.py                # Environment & Pydantic settings
│   ├── extract.py               # Gemini extraction worker
│   ├── models.py                # Pydantic schemas (ExtractionBatch, etc.)
│   └── rag.py                   # Vector search & RFP matching logic
├── .env.example
├── .gitignore
├── Dockerfile                   # Builds the app container for Portainer
├── requirements.txt
└── README.md
```

---

## ⚡ Features

1. **Automated RFP & Spec Extraction**: Parses raw engineering RFP text, FEED documents, and equipment specifications into structured requirements categorized by discipline, compliance level, and estimated cost impact using Gemini.
2. **PostgreSQL + pgvector Store**: Persists extracted requirements and stores dense vector embeddings (`text-embedding-004`) for similarity matching.
3. **SME Review & Validation Queue**: Interactive Streamlit interface for Subject Matter Experts to filter, edit, approve, or reject extracted requirements with comments.
4. **Vector Search & RFP Matching**: Semantic search across previous engineering specs and clauses to identify duplicates, conflicts, or existing standards.
5. **Containerized Deployment**: Ready for single-command deployment via Docker Compose or Portainer stacks.

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
Access the Streamlit application at: `http://localhost:8501`

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

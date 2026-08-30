# Capital Engineering Copilot - Antigravity Agent Rules

## Overview & Domain
Capital Engineering Copilot is an AI-powered system designed to process RFP (Request for Proposal) documents, specifications, and engineering requirements using Google Gemini, store and index them in PostgreSQL with pgvector, and provide an SME (Subject Matter Expert) review and validation workflow via a Streamlit interface.

## Technology Stack & Architecture
- **Language & Runtime**: Python 3.11+
- **LLM & Embeddings**: Google Gemini API (`google-genai` / `google-generativeai`), embeddings via `text-embedding-004`
- **Data Modeling & Validation**: Pydantic v2 & `pydantic-settings`
- **Database & Search**: PostgreSQL with `pgvector` extension, SQLAlchemy / psycopg3
- **User Interface**: Streamlit (SME review, document extraction viewer, search & match verification)
- **Containerization & Deployment**: Docker, Docker Compose, Portainer stack deployment

## Coding Standards & Guidelines
1. **Type Hints & Schemas**: Always use explicit Python type annotations and Pydantic models for structured LLM input/output and database records.
2. **Configuration**: Never hardcode secrets or connection strings. All settings must be defined in `src/config.py` backed by environment variables.
3. **Database & Vectors**:
   - Ensure the vector dimension matches the embedding model (default: 768 for `text-embedding-004`).
   - Use HNSW indexes for fast approximate nearest neighbor search over cosine distance (`vector_cosine_ops`).
4. **Error Handling & Resilience**:
   - Wrap LLM API calls with graceful fallback and retry mechanisms.
   - Handle database connection pooling and query exceptions appropriately.
5. **Streamlit UI**:
   - Maintain clean session state management.
   - Keep UI responsive with appropriate caching (`@st.cache_data`, `@st.cache_resource`).
   - Provide clear visual indicators for SME review statuses (Pending, Approved, Rejected, Edited).

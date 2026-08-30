# Engineering Context & Vibe Rules
- Architecture: Hybrid RAG + Structured Postgres with `pgvector`.
- LLM Provider: Google Gemini (`google-genai` SDK), strictly using structured outputs with Pydantic.
- Quality: No placeholders or mock dictionaries. Always implement functional error handling with `psycopg3`.
- Style: Fast, pragmatic, modular Python 3.11+.
- Database: Assume PostgreSQL 16 + pgvector running on host `postgres` (or localhost for dev).
- When generating code, create corresponding pytest cases or validation blocks.

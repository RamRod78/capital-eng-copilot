import logging
from typing import List, Optional
from uuid import UUID
import psycopg
from pgvector.psycopg import register_vector
from google import genai

from src.config import settings
from src.models import SearchResult, ExtractionItem

logger = logging.getLogger(__name__)


def get_embedding(text: str, client: Optional[genai.Client] = None) -> List[float]:
    """Generate embedding vector using Gemini text-embedding model."""
    if client is None:
        client = genai.Client(api_key=settings.gemini_api_key)
    
    try:
        response = client.models.embed_content(
            model=settings.gemini_embedding_model,
            contents=text,
        )
        # Handle embedding output
        if hasattr(response, "embedding") and hasattr(response.embedding, "values"):
            return response.embedding.values
        elif hasattr(response, "embeddings") and len(response.embeddings) > 0:
            return response.embeddings[0].values
        return []
    except Exception as e:
        logger.error(f"Error generating embedding: {e}")
        return []


def get_db_connection():
    """Establish and configure psycopg connection with pgvector."""
    conn = psycopg.connect(settings.database_url)
    register_vector(conn)
    return conn


def store_extraction_and_embeddings(
    batch_id: str,
    document_id: Optional[UUID],
    items: List[ExtractionItem],
    client: Optional[genai.Client] = None,
) -> int:
    """Store extracted items and their vector embeddings in PostgreSQL."""
    stored_count = 0
    with get_db_connection() as conn:
        with conn.cursor() as cur:
            for item in items:
                # Insert extraction record
                cur.execute(
                    """
                    INSERT INTO extractions (
                        document_id, batch_id, section_title, requirement_code,
                        requirement_text, category, engineering_discipline,
                        compliance_level, estimated_cost_impact, confidence_score, status
                    ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, 'Pending Review')
                    RETURNING id;
                    """,
                    (
                        document_id,
                        batch_id,
                        item.section_title,
                        item.requirement_code,
                        item.requirement_text,
                        item.category,
                        item.engineering_discipline.value if hasattr(item.engineering_discipline, "value") else str(item.engineering_discipline),
                        item.compliance_level.value if hasattr(item.compliance_level, "value") else str(item.compliance_level),
                        item.estimated_cost_impact.value if hasattr(item.estimated_cost_impact, "value") else str(item.estimated_cost_impact),
                        item.confidence_score,
                    ),
                )
                extraction_id = cur.fetchone()[0]

                # Generate vector embedding for requirement text
                vector = get_embedding(item.requirement_text, client=client)
                if vector and len(vector) == settings.embedding_dimension:
                    cur.execute(
                        """
                        INSERT INTO requirement_embeddings (extraction_id, chunk_text, embedding)
                        VALUES (%s, %s, %s);
                        """,
                        (extraction_id, item.requirement_text, vector),
                    )
                stored_count += 1
        conn.commit()
    return stored_count


def search_similar_requirements(
    query_text: str,
    top_k: int = 5,
    client: Optional[genai.Client] = None,
) -> List[SearchResult]:
    """Perform cosine distance vector search over requirement embeddings."""
    query_vector = get_embedding(query_text, client=client)
    if not query_vector:
        return []

    results = []
    with get_db_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT 
                    e.id,
                    e.requirement_code,
                    e.requirement_text,
                    e.category,
                    e.engineering_discipline,
                    e.compliance_level,
                    e.status,
                    1 - (re.embedding <=> %s) AS similarity
                FROM requirement_embeddings re
                JOIN extractions e ON e.id = re.extraction_id
                ORDER BY re.embedding <=> %s
                LIMIT %s;
                """,
                (query_vector, query_vector, top_k),
            )
            rows = cur.fetchall()
            for row in rows:
                results.append(
                    SearchResult(
                        extraction_id=row[0],
                        requirement_code=row[1],
                        requirement_text=row[2],
                        category=row[3],
                        engineering_discipline=row[4],
                        compliance_level=row[5],
                        status=row[6],
                        similarity_score=float(row[7]) if row[7] is not None else 0.0,
                    )
                )
    return results

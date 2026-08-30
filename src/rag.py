import logging
from typing import List, Optional, Tuple, Dict, Any
from uuid import UUID
import pandas as pd
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
                        requirement_text, item_type, category, engineering_discipline,
                        compliance_level, estimated_cost_impact, document_owner,
                        confidence_score, confidence_reasoning, status
                    ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, 'Pending Review')
                    RETURNING id;
                    """,
                    (
                        document_id,
                        batch_id,
                        item.section_title,
                        item.requirement_code,
                        item.requirement_text,
                        item.item_type.value if hasattr(item.item_type, "value") else str(item.item_type),
                        item.category,
                        item.engineering_discipline.value if hasattr(item.engineering_discipline, "value") else str(item.engineering_discipline),
                        item.compliance_level.value if hasattr(item.compliance_level, "value") else str(item.compliance_level),
                        item.estimated_cost_impact.value if hasattr(item.estimated_cost_impact, "value") else str(item.estimated_cost_impact),
                        item.document_owner,
                        item.confidence_score,
                        item.confidence_reasoning,
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
    discipline_filter: Optional[str] = None,
    item_type_filter: Optional[str] = None,
    status_filter: Optional[str] = None,
    client: Optional[genai.Client] = None,
) -> List[SearchResult]:
    """Perform hybrid search (cosine distance vector similarity + relational metadata filters)."""
    query_vector = get_embedding(query_text, client=client)
    if not query_vector:
        return []

    results = []
    with get_db_connection() as conn:
        with conn.cursor() as cur:
            query = """
                SELECT 
                    e.id,
                    e.requirement_code,
                    e.requirement_text,
                    COALESCE(e.item_type, 'Requirement') AS item_type,
                    e.category,
                    e.engineering_discipline,
                    e.compliance_level,
                    e.document_owner,
                    e.status,
                    1 - (re.embedding <=> %s) AS similarity
                FROM requirement_embeddings re
                JOIN extractions e ON e.id = re.extraction_id
                WHERE 1=1
            """
            params = [query_vector]

            if discipline_filter and discipline_filter != "All":
                query += " AND e.engineering_discipline = %s"
                params.append(discipline_filter)

            if item_type_filter and item_type_filter != "All":
                query += " AND e.item_type = %s"
                params.append(item_type_filter)

            if status_filter and status_filter != "All":
                query += " AND e.status = %s"
                params.append(status_filter)

            query += " ORDER BY re.embedding <=> %s LIMIT %s;"
            params.extend([query_vector, top_k])

            cur.execute(query, params)
            rows = cur.fetchall()
            for row in rows:
                results.append(
                    SearchResult(
                        extraction_id=row[0],
                        requirement_code=row[1],
                        requirement_text=row[2],
                        item_type=row[3] or "Requirement",
                        category=row[4],
                        engineering_discipline=row[5],
                        compliance_level=row[6],
                        document_owner=row[7],
                        status=row[8],
                        similarity_score=float(row[9]) if row[9] is not None else 0.0,
                    )
                )
    return results


def fetch_extractions(
    status_filter: Optional[str] = None,
    discipline_filter: Optional[str] = None,
    owner_filter: Optional[str] = None,
    low_confidence_only: bool = False,
) -> pd.DataFrame:
    """Retrieve extractions from DB with multi-attribute filters."""
    try:
        with get_db_connection() as conn:
            query = """
                SELECT id, batch_id, requirement_code, section_title, requirement_text,
                       COALESCE(item_type, 'Requirement') AS item_type,
                       category, engineering_discipline, compliance_level,
                       estimated_cost_impact, document_owner, confidence_score,
                       confidence_reasoning, status, sme_reviewer, sme_comments, created_at
                FROM extractions
                WHERE 1=1
            """
            params = []
            if status_filter and status_filter != "All":
                query += " AND status = %s"
                params.append(status_filter)
            if discipline_filter and discipline_filter != "All":
                query += " AND engineering_discipline = %s"
                params.append(discipline_filter)
            if owner_filter and owner_filter != "All":
                query += " AND document_owner = %s"
                params.append(owner_filter)
            if low_confidence_only:
                query += " AND confidence_score < 0.85"

            query += " ORDER BY confidence_score ASC, created_at DESC;"

            with conn.cursor() as cur:
                cur.execute(query, params)
                columns = [desc[0] for desc in cur.description]
                rows = cur.fetchall()
                return pd.DataFrame(rows, columns=columns)
    except Exception as e:
        logger.error(f"Error fetching extractions: {e}")
        return pd.DataFrame()


def update_extraction_full(
    extraction_id: UUID,
    status: str,
    reviewer: str,
    item_type: Optional[str] = None,
    engineering_discipline: Optional[str] = None,
    compliance_level: Optional[str] = None,
    estimated_cost_impact: Optional[str] = None,
    category: Optional[str] = None,
    requirement_text: Optional[str] = None,
    sme_comments: Optional[str] = None,
) -> Tuple[bool, Optional[str]]:
    """Update all classification attributes for an extraction item."""
    try:
        with get_db_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    UPDATE extractions
                    SET status = %s,
                        sme_reviewer = %s,
                        item_type = COALESCE(%s, item_type),
                        engineering_discipline = COALESCE(%s, engineering_discipline),
                        compliance_level = COALESCE(%s, compliance_level),
                        estimated_cost_impact = COALESCE(%s, estimated_cost_impact),
                        category = COALESCE(%s, category),
                        requirement_text = COALESCE(%s, requirement_text),
                        sme_comments = COALESCE(%s, sme_comments),
                        reviewed_at = CURRENT_TIMESTAMP
                    WHERE id = %s;
                    """,
                    (
                        status,
                        reviewer,
                        item_type,
                        engineering_discipline,
                        compliance_level,
                        estimated_cost_impact,
                        category,
                        requirement_text,
                        sme_comments,
                        str(extraction_id),
                    ),
                )
            conn.commit()
        return True, None
    except Exception as e:
        return False, str(e)


def bulk_update_extractions(items_to_update: List[Dict[str, Any]], reviewer: str) -> Tuple[int, List[str]]:
    """Bulk update multiple extractions in a single database transaction."""
    if not items_to_update:
        return 0, []

    success_count = 0
    errors = []
    try:
        with get_db_connection() as conn:
            with conn.cursor() as cur:
                for item in items_to_update:
                    cur.execute(
                        """
                        UPDATE extractions
                        SET status = %s,
                            sme_reviewer = %s,
                            item_type = COALESCE(%s, item_type),
                            engineering_discipline = COALESCE(%s, engineering_discipline),
                            compliance_level = COALESCE(%s, compliance_level),
                            estimated_cost_impact = COALESCE(%s, estimated_cost_impact),
                            category = COALESCE(%s, category),
                            requirement_text = COALESCE(%s, requirement_text),
                            sme_comments = COALESCE(%s, sme_comments),
                            reviewed_at = CURRENT_TIMESTAMP
                        WHERE id = %s;
                        """,
                        (
                            item.get("status", "Approved"),
                            reviewer,
                            item.get("item_type"),
                            item.get("engineering_discipline"),
                            item.get("compliance_level"),
                            item.get("estimated_cost_impact"),
                            item.get("category"),
                            item.get("requirement_text"),
                            item.get("sme_comments"),
                            str(item["id"]),
                        ),
                    )
                    success_count += 1
            conn.commit()
    except Exception as e:
        errors.append(str(e))

    return success_count, errors

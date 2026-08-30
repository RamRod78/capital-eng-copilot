import logging
from typing import List, Optional, Tuple
from uuid import UUID, uuid4
import pandas as pd
from datetime import datetime

from src.models import FeedbackEntry, DocumentRevisionFlag, ReviewStatus
from src.rag import get_db_connection

logger = logging.getLogger(__name__)


def log_feedback_entry(
    original_text: str,
    reviewed_text: Optional[str],
    original_status: str,
    final_status: str,
    reviewer: str,
    reason: str,
    extraction_id: Optional[UUID] = None,
    project_scope_id: Optional[UUID] = None,
) -> bool:
    """Log an SME modification or rejection event into the feedback lessons store."""
    try:
        with get_db_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    INSERT INTO feedback_lessons (
                        extraction_id, project_scope_id, original_text,
                        reviewed_text, original_status, final_status,
                        reviewer, reason
                    ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s);
                    """,
                    (
                        extraction_id,
                        project_scope_id,
                        original_text,
                        reviewed_text,
                        original_status,
                        final_status,
                        reviewer,
                        reason,
                    ),
                )
            conn.commit()
        return True
    except Exception as e:
        logger.error(f"Error logging feedback entry: {e}")
        return False


def fetch_feedback_lessons() -> pd.DataFrame:
    """Retrieve all lessons learned records."""
    try:
        with get_db_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT id, extraction_id, original_text, reviewed_text,
                           original_status, final_status, reviewer, reason, created_at
                    FROM feedback_lessons
                    ORDER BY created_at DESC;
                    """
                )
                columns = [desc[0] for desc in cur.description]
                rows = cur.fetchall()
                return pd.DataFrame(rows, columns=columns)
    except Exception as e:
        logger.error(f"Error fetching feedback lessons: {e}")
        return pd.DataFrame()


def flag_document_for_revision(
    document_title: str,
    document_owner: str,
    flagged_by: str,
    issue_description: str,
    suggested_action: str = "Review and Update Standard",
    document_id: Optional[UUID] = None,
) -> Tuple[bool, Optional[str]]:
    """Create a revision flag on an upstream document to notify its owner."""
    try:
        with get_db_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    INSERT INTO document_revision_flags (
                        document_id, document_title, document_owner,
                        flagged_by, issue_description, suggested_action
                    ) VALUES (%s, %s, %s, %s, %s, %s);
                    """,
                    (
                        document_id,
                        document_title,
                        document_owner,
                        flagged_by,
                        issue_description,
                        suggested_action,
                    ),
                )
            conn.commit()
        return True, None
    except Exception as e:
        logger.error(f"Error creating document revision flag: {e}")
        return False, str(e)


def fetch_document_flags(owner_filter: Optional[str] = None, show_resolved: bool = False) -> pd.DataFrame:
    """Retrieve document revision flags with optional owner filtering."""
    try:
        with get_db_connection() as conn:
            with conn.cursor() as cur:
                query = """
                    SELECT id, document_title, document_owner, flagged_by,
                           issue_description, suggested_action, is_resolved, created_at
                    FROM document_revision_flags
                    WHERE 1=1
                """
                params = []
                if not show_resolved:
                    query += " AND is_resolved = FALSE"
                if owner_filter and owner_filter != "All":
                    query += " AND document_owner = %s"
                    params.append(owner_filter)

                query += " ORDER BY created_at DESC;"

                cur.execute(query, params)
                columns = [desc[0] for desc in cur.description]
                rows = cur.fetchall()
                return pd.DataFrame(rows, columns=columns)
    except Exception as e:
        logger.error(f"Error fetching document flags: {e}")
        return pd.DataFrame()


def resolve_document_flag(flag_id: UUID) -> bool:
    """Mark a document revision flag as resolved."""
    try:
        with get_db_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    UPDATE document_revision_flags
                    SET is_resolved = TRUE, resolved_at = CURRENT_TIMESTAMP
                    WHERE id = %s;
                    """,
                    (str(flag_id),),
                )
            conn.commit()
        return True
    except Exception as e:
        logger.error(f"Error resolving document flag: {e}")
        return False

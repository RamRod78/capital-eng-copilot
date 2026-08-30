import streamlit as st
import pandas as pd
from datetime import datetime
from uuid import UUID
import psycopg

from src.config import settings
from src.extract import extract_requirements_from_text
from src.rag import store_extraction_and_embeddings, search_similar_requirements, get_db_connection
from src.models import ReviewStatus, EngineeringDiscipline, ComplianceLevel

st.set_page_config(
    page_title="Capital Engineering Copilot",
    page_icon="🏗️",
    layout="wide",
    initial_sidebar_state="expanded",
)

# Custom CSS for styling
st.markdown("""
<style>
    .main-header {
        font-size: 2.2rem;
        font-weight: 700;
        color: #1E3A8A;
        margin-bottom: 0.5rem;
    }
    .sub-header {
        font-size: 1.1rem;
        color: #4B5563;
        margin-bottom: 1.5rem;
    }
    .metric-card {
        background-color: #F3F4F6;
        padding: 1rem;
        border-radius: 0.5rem;
        border-left: 5px solid #2563EB;
    }
    .status-badge {
        padding: 0.25rem 0.5rem;
        border-radius: 4px;
        font-size: 0.85rem;
        font-weight: 600;
    }
</style>
""", unsafe_allow_html=True)


def check_db_connection():
    """Verify database connection status."""
    try:
        with get_db_connection() as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT 1;")
                return True, "Connected"
    except Exception as e:
        return False, str(e)


def fetch_extractions(status_filter=None, discipline_filter=None):
    """Retrieve extractions from DB with optional filters."""
    try:
        with get_db_connection() as conn:
            query = """
                SELECT id, batch_id, requirement_code, section_title, requirement_text,
                       category, engineering_discipline, compliance_level,
                       estimated_cost_impact, confidence_score, status,
                       sme_reviewer, sme_comments, created_at
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

            query += " ORDER BY created_at DESC"

            with conn.cursor() as cur:
                cur.execute(query, params)
                columns = [desc[0] for desc in cur.description]
                rows = cur.fetchall()
                return pd.DataFrame(rows, columns=columns)
    except Exception as e:
        st.error(f"Error fetching extractions: {e}")
        return pd.DataFrame()


def update_extraction_status(extraction_id, status, reviewer, comments="", edited_text=None):
    """Update review status and comments in PostgreSQL."""
    try:
        with get_db_connection() as conn:
            with conn.cursor() as cur:
                if edited_text:
                    cur.execute(
                        """
                        UPDATE extractions
                        SET status = %s, sme_reviewer = %s, sme_comments = %s,
                            requirement_text = %s, reviewed_at = CURRENT_TIMESTAMP
                        WHERE id = %s
                        """,
                        (status, reviewer, comments, edited_text, extraction_id),
                    )
                else:
                    cur.execute(
                        """
                        UPDATE extractions
                        SET status = %s, sme_reviewer = %s, sme_comments = %s,
                            reviewed_at = CURRENT_TIMESTAMP
                        WHERE id = %s
                        """,
                        (status, reviewer, comments, extraction_id),
                    )
            conn.commit()
        return True
    except Exception as e:
        st.error(f"Error updating status: {e}")
        return False


# --- Sidebar ---
st.sidebar.image("https://img.icons8.com/fluency/96/engineering.png", width=64)
st.sidebar.title("Engineering Copilot")
st.sidebar.markdown("---")

db_ok, db_msg = check_db_connection()
if db_ok:
    st.sidebar.success("🟢 PostgreSQL & pgvector Connected")
else:
    st.sidebar.warning(f"🟡 DB Offline / Not Reached:\n`{db_msg}`")

if settings.gemini_api_key:
    st.sidebar.success("🟢 Gemini API Configured")
else:
    st.sidebar.error("🔴 GEMINI_API_KEY Missing")

st.sidebar.markdown("---")
reviewer_name = st.sidebar.text_input("Reviewer Name / SME ID", value="SME-Engineer-1")

# --- Main Layout ---
st.markdown('<div class="main-header">🏗️ Capital Engineering Copilot</div>', unsafe_allow_html=True)
st.markdown(
    '<div class="sub-header">AI-Assisted RFP Extraction, Vector Search & Subject Matter Expert (SME) Review</div>',
    unsafe_allow_html=True,
)

tab_extract, tab_review, tab_search, tab_settings = st.tabs([
    "📥 Extract RFP Requirements",
    "📋 SME Review Queue",
    "🔍 Vector Search & Matching",
    "⚙️ Settings & System",
])

# --- Tab 1: Extract RFP Requirements ---
with tab_extract:
    st.subheader("Extract Requirements from Engineering Specifications")
    st.write("Upload or paste technical specifications, FEED documents, or RFP texts to run Gemini extraction.")

    col1, col2 = st.columns([2, 1])
    with col1:
        doc_title = st.text_input("Document / Project Title", value="Capital Project Unit 4 Expansion RFP")
        raw_text = st.text_area(
            "RFP / Specification Text",
            height=280,
            placeholder="Paste technical requirements, FEED clauses, or equipment specifications here...",
        )
    with col2:
        st.info(
            "**Gemini Extraction Worker**\n\n"
            "- Parses clauses into structured items\n"
            "- Classifies engineering discipline\n"
            "- Evaluates compliance levels & cost impact\n"
            "- Computes pgvector embeddings for RAG"
        )
        run_extract = st.button("🚀 Run Gemini Extraction", type="primary", use_container_width=True)

    if run_extract:
        if not raw_text.strip():
            st.warning("Please provide specification text to extract.")
        else:
            with st.spinner("Extracting structured engineering requirements using Gemini..."):
                batch = extract_requirements_from_text(raw_text, document_title=doc_title)
                st.session_state["latest_batch"] = batch
                st.session_state["latest_raw_text"] = raw_text

    if "latest_batch" in st.session_state:
        batch = st.session_state["latest_batch"]
        st.success(f"Extraction complete! Found {len(batch.items)} requirement items.")
        if batch.executive_summary:
            st.markdown(f"**Extraction Summary:** {batch.executive_summary}")

        if batch.items:
            items_data = [
                {
                    "Code": item.requirement_code or "N/A",
                    "Discipline": item.engineering_discipline.value if hasattr(item.engineering_discipline, "value") else str(item.engineering_discipline),
                    "Compliance": item.compliance_level.value if hasattr(item.compliance_level, "value") else str(item.compliance_level),
                    "Requirement": item.requirement_text,
                    "Cost Impact": item.estimated_cost_impact.value if hasattr(item.estimated_cost_impact, "value") else str(item.estimated_cost_impact or "N/A"),
                    "Confidence": f"{item.confidence_score:.2f}",
                }
                for item in batch.items
            ]
            st.dataframe(pd.DataFrame(items_data), use_container_width=True)

            if st.button("💾 Save Batch to PostgreSQL & Index Vectors"):
                with st.spinner("Saving to database and generating embeddings..."):
                    # Insert document record
                    try:
                        with get_db_connection() as conn:
                            with conn.cursor() as cur:
                                cur.execute(
                                    """
                                    INSERT INTO documents (filename, document_type, raw_content)
                                    VALUES (%s, 'RFP', %s)
                                    RETURNING id;
                                    """,
                                    (batch.document_title, st.session_state.get("latest_raw_text", "")),
                                )
                                doc_id = cur.fetchone()[0]
                            conn.commit()

                        count = store_extraction_and_embeddings(
                            batch_id=batch.batch_id,
                            document_id=doc_id,
                            items=batch.items,
                        )
                        st.success(f"Successfully stored {count} requirements and embeddings in pgvector!")
                    except Exception as e:
                        st.error(f"Error saving to database: {e}")

# --- Tab 2: SME Review Queue ---
with tab_review:
    st.subheader("SME Review & Validation Interface")
    
    col_f1, col_f2, col_f3 = st.columns([1, 1, 2])
    with col_f1:
        status_filter = st.selectbox("Status Filter", ["All", "Pending Review", "Approved", "Rejected", "Edited"])
    with col_f2:
        discipline_filter = st.selectbox(
            "Discipline Filter",
            ["All"] + [d.value for d in EngineeringDiscipline],
        )
    with col_f3:
        st.write("")
        st.write("")
        if st.button("🔄 Refresh Review Queue"):
            st.rerun()

    df_extractions = fetch_extractions(status_filter=status_filter, discipline_filter=discipline_filter)

    if df_extractions.empty:
        st.info("No requirements found matching current filters.")
    else:
        st.write(f"Total Requirements: **{len(df_extractions)}**")
        
        for idx, row in df_extractions.iterrows():
            with st.expander(
                f"[{row['status']}] {row['requirement_code'] or 'REQ'} - {row['engineering_discipline']} | {row['requirement_text'][:80]}..."
            ):
                c_detail1, c_detail2 = st.columns([3, 2])
                with c_detail1:
                    edited_req = st.text_area(
                        "Requirement Statement",
                        value=row["requirement_text"],
                        key=f"text_{row['id']}",
                    )
                    sme_comment = st.text_input(
                        "SME Feedback / Notes",
                        value=row["sme_comments"] or "",
                        key=f"comment_{row['id']}",
                    )
                with c_detail2:
                    st.write(f"**Discipline:** {row['engineering_discipline']}")
                    st.write(f"**Compliance Level:** {row['compliance_level']}")
                    st.write(f"**Cost Impact:** {row['estimated_cost_impact'] or 'N/A'}")
                    st.write(f"**Confidence Score:** {row['confidence_score']}")
                    st.write(f"**Last Reviewer:** {row['sme_reviewer'] or 'None'}")

                    b_col1, b_col2, b_col3 = st.columns(3)
                    with b_col1:
                        if st.button("✅ Approve", key=f"app_{row['id']}", use_container_width=True):
                            if update_extraction_status(row['id'], "Approved", reviewer_name, sme_comment):
                                st.success("Approved!")
                                st.rerun()
                    with b_col2:
                        if st.button("✏️ Save Edit", key=f"edit_{row['id']}", use_container_width=True):
                            if update_extraction_status(row['id'], "Edited", reviewer_name, sme_comment, edited_text=edited_req):
                                st.success("Updated!")
                                st.rerun()
                    with b_col3:
                        if st.button("❌ Reject", key=f"rej_{row['id']}", use_container_width=True):
                            if update_extraction_status(row['id'], "Rejected", reviewer_name, sme_comment):
                                st.warning("Rejected")
                                st.rerun()

# --- Tab 3: Vector Search & Matching ---
with tab_search:
    st.subheader("Semantic Search & Requirement Matching")
    st.write("Query across past engineering requirements and RFP clauses using cosine similarity in pgvector.")

    search_query = st.text_input("Enter search query or specification clause to match:", placeholder="e.g. Pump seal flush plan API 682 Plan 53B")
    top_k = st.slider("Max Results (Top K)", min_value=1, max_value=20, value=5)

    if st.button("🔍 Search Matching Requirements", type="primary"):
        if not search_query.strip():
            st.warning("Please enter a query.")
        else:
            with st.spinner("Searching embeddings..."):
                results = search_similar_requirements(search_query, top_k=top_k)
                if not results:
                    st.info("No matching requirements found.")
                else:
                    st.success(f"Found {len(results)} matching records:")
                    for r in results:
                        st.markdown(f"""
                        ---
                        **Code:** `{r.requirement_code or 'N/A'}` | **Discipline:** `{r.engineering_discipline}` | **Match Score:** `{r.similarity_score:.3f}` | **Status:** `{r.status}`  
                        > {r.requirement_text}  
                        *Category: {r.category or 'General'} | Compliance: {r.compliance_level}*
                        """)

# --- Tab 4: Settings & System ---
with tab_settings:
    st.subheader("System Configuration & Health")
    st.json({
        "gemini_model": settings.gemini_model,
        "gemini_embedding_model": settings.gemini_embedding_model,
        "embedding_dimension": settings.embedding_dimension,
        "database_url": settings.database_url.replace(settings.database_url.split('@')[0], 'postgresql://***:***') if '@' in settings.database_url else settings.database_url,
        "port": settings.streamlit_server_port,
    })

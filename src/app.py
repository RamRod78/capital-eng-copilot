import sys
from pathlib import Path

# Ensure project root is in sys.path
root_dir = str(Path(__file__).resolve().parent.parent)
if root_dir not in sys.path:
    sys.path.insert(0, root_dir)

import streamlit as st
import pandas as pd
from datetime import datetime

from src.config import settings
from src.rag import get_db_connection
from src.feedback.loop import fetch_document_flags

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
        font-size: 2.3rem;
        font-weight: 700;
        color: #1E3A8A;
        margin-bottom: 0.2rem;
    }
    .sub-header {
        font-size: 1.1rem;
        color: #4B5563;
        margin-bottom: 1.5rem;
    }
    .metric-box {
        background: linear-gradient(135deg, #F8FAFC 0%, #EFF6FF 100%);
        padding: 1.25rem;
        border-radius: 0.75rem;
        border: 1px solid #DBEAFE;
        border-left: 6px solid #2563EB;
    }
    .metric-value {
        font-size: 2rem;
        font-weight: 700;
        color: #1E3A8A;
    }
    .metric-label {
        font-size: 0.9rem;
        color: #64748B;
        font-weight: 600;
        text-transform: uppercase;
    }
    .card-container {
        background-color: #FFFFFF;
        padding: 1.5rem;
        border-radius: 0.75rem;
        border: 1px solid #E2E8F0;
        box-shadow: 0 1px 3px rgba(0,0,0,0.05);
        margin-bottom: 1rem;
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


def get_dashboard_metrics():
    """Aggregate high-level engineering and knowledge base statistics."""
    stats = {
        "total_docs": 0,
        "total_items": 0,
        "pending_reviews": 0,
        "low_confidence_items": 0,
        "approved_items": 0,
        "project_scopes": 0,
        "active_flags": 0,
    }
    try:
        with get_db_connection() as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT COUNT(*) FROM documents;")
                stats["total_docs"] = cur.fetchone()[0]

                cur.execute("SELECT COUNT(*) FROM extractions;")
                stats["total_items"] = cur.fetchone()[0]

                cur.execute("SELECT COUNT(*) FROM extractions WHERE status = 'Pending Review';")
                stats["pending_reviews"] = cur.fetchone()[0]

                cur.execute("SELECT COUNT(*) FROM extractions WHERE confidence_score < 0.85 AND status = 'Pending Review';")
                stats["low_confidence_items"] = cur.fetchone()[0]

                cur.execute("SELECT COUNT(*) FROM extractions WHERE status = 'Approved';")
                stats["approved_items"] = cur.fetchone()[0]

                cur.execute("SELECT COUNT(*) FROM project_scopes;")
                stats["project_scopes"] = cur.fetchone()[0]

                cur.execute("SELECT COUNT(*) FROM document_revision_flags WHERE is_resolved = FALSE;")
                stats["active_flags"] = cur.fetchone()[0]
    except Exception:
        pass
    return stats


# --- Sidebar ---
st.sidebar.image("https://img.icons8.com/fluency/96/engineering.png", width=64)
st.sidebar.title("Engineering Copilot")
st.sidebar.caption("Capital Projects AI & Knowledge Hub")
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
st.sidebar.info(
    "💡 **Navigation**\n\n"
    "Select any module from the sidebar:\n"
    "- **1 📥 Ingest & Extract**\n"
    "- **2 📋 SME Review Queue**\n"
    "- **3 🎯 Project Scoping & RFP**\n"
    "- **4 💡 Lessons Learned**\n"
    "- **5 🔍 Knowledge Explorer**"
)

# --- Main Page Layout ---
st.markdown('<div class="main-header">🏗️ Capital Engineering Copilot</div>', unsafe_allow_html=True)
st.markdown(
    '<div class="sub-header">AI-Powered Engineering Standards Ingestion, Multi-Discipline SME Validation & Project RFP Generation</div>',
    unsafe_allow_html=True,
)

stats = get_dashboard_metrics()

col1, col2, col3, col4 = st.columns(4)
with col1:
    st.markdown(
        f'<div class="metric-box"><div class="metric-label">Knowledge Items</div>'
        f'<div class="metric-value">{stats["total_items"]}</div></div>',
        unsafe_allow_html=True,
    )
with col2:
    st.markdown(
        f'<div class="metric-box"><div class="metric-label">Pending SME Reviews</div>'
        f'<div class="metric-value" style="color:#D97706;">{stats["pending_reviews"]}</div></div>',
        unsafe_allow_html=True,
    )
with col3:
    st.markdown(
        f'<div class="metric-box"><div class="metric-label">Low Confidence (<0.85)</div>'
        f'<div class="metric-value" style="color:#DC2626;">{stats["low_confidence_items"]}</div></div>',
        unsafe_allow_html=True,
    )
with col4:
    st.markdown(
        f'<div class="metric-box"><div class="metric-label">Capital Project Scopes</div>'
        f'<div class="metric-value" style="color:#059669;">{stats["project_scopes"]}</div></div>',
        unsafe_allow_html=True,
    )

st.markdown("---")

c_left, c_right = st.columns([1.8, 1.2])

with c_left:
    st.markdown("### 🚀 Quick Workflow Actions")
    
    col_a, col_b = st.columns(2)
    with col_a:
        st.markdown("""
        <div class="card-container">
            <h4>📥 1. Ingest Engineering Specs</h4>
            <p>Upload FEED dossiers, ASME/API standards, and equipment datasheets. Extract requirements, recommendations, and guidelines with confidence scores.</p>
        </div>
        """, unsafe_allow_html=True)
        st.page_link("pages/1_📥_Ingest_&_Extract.py", label="Go to Ingestion & Extraction", icon="📥")

    with col_b:
        st.markdown("""
        <div class="card-container">
            <h4>📋 2. SME Review Queue</h4>
            <p>Review low-confidence items flagged for discipline owner validation. Approve, edit, reclassify, or reject clauses with audit trails.</p>
        </div>
        """, unsafe_allow_html=True)
        st.page_link("pages/2_📋_SME_Review_Queue.py", label="Open SME Review Queue", icon="📋")

    col_c, col_d = st.columns(2)
    with col_c:
        st.markdown("""
        <div class="card-container">
            <h4>🎯 3. Project Scoping & RFP</h4>
            <p>Enter new capital project parameters to match relevant requirements and generate vendor-ready RFP / SOW packages.</p>
        </div>
        """, unsafe_allow_html=True)
        st.page_link("pages/3_🎯_Project_Scoping_&_RFP.py", label="Launch Scoping & RFP Generator", icon="🎯")

    with col_d:
        st.markdown("""
        <div class="card-container">
            <h4>💡 4. Lessons Learned</h4>
            <p>Closed-loop feedback engine tracking SME revisions, rejected specs, and action items for upstream document owners.</p>
        </div>
        """, unsafe_allow_html=True)
        st.page_link("pages/4_💡_Lessons_Learned.py", label="View Lessons Learned", icon="💡")

with c_right:
    st.markdown("### 🔔 Active Document Revision Flags")
    flags_df = fetch_document_flags()
    if flags_df.empty:
        st.success("✅ No open document revision flags. All upstream standards are up to date.")
    else:
        st.warning(f"⚠️ **{len(flags_df)} Upstream Standards Flagged for Revision**")
        for _, flag in flags_df.head(4).iterrows():
            st.markdown(f"""
            **📄 {flag['document_title']}**  
            *Owner:* `{flag['document_owner']}` | *Flagged By:* `{flag['flagged_by']}`  
            > ❗ **Issue:** {flag['issue_description']}  
            *Action:* `{flag['suggested_action']}`
            ---
            """)
        st.page_link("pages/4_💡_Lessons_Learned.py", label="View All Revision Flags", icon="🔔")

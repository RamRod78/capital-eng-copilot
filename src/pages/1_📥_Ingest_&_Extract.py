import sys
from pathlib import Path

# Ensure project root is in sys.path
root_dir = str(Path(__file__).resolve().parents[2])
if root_dir not in sys.path:
    sys.path.insert(0, root_dir)

import streamlit as st
import pandas as pd
from uuid import uuid4

from src.extract import extract_requirements_from_text
from src.rag import store_extraction_and_embeddings, get_db_connection
from src.models import EngineeringDiscipline
from src.parsers import parse_uploaded_file

st.set_page_config(page_title="Ingest & Extract | Capital Engineering Copilot", page_icon="📥", layout="wide")

st.markdown("## 📥 Ingest Engineering Documents & Extract Requirements")
st.write("Upload specification documents (PDF, Word, Excel, CSV, Text) or paste raw engineering text. Gemini extracts requirements, recommendations, and guidelines with confidence scores.")

col1, col2 = st.columns([2, 1])

with col1:
    input_method = st.radio(
        "Select Document Input Method:",
        ["📁 Upload Document File (PDF, DOCX, XLSX, CSV, TXT)", "📝 Paste Specification Text"],
        horizontal=True,
    )

    doc_text_to_process = ""
    suggested_title = "Engineering Specification"

    if "Upload Document File" in input_method:
        uploaded_file = st.file_uploader(
            "Upload an engineering document:",
            type=["pdf", "docx", "doc", "xlsx", "xls", "csv", "txt", "md"],
            help="Supports Adobe PDF (.pdf), Microsoft Word (.docx), Excel spreadsheets (.xlsx, .csv), and Markdown/Text (.txt, .md)",
        )
        if uploaded_file is not None:
            suggested_title = uploaded_file.name.rsplit(".", 1)[0]
            with st.spinner(f"Parsing content from `{uploaded_file.name}`..."):
                extracted_text, parse_error = parse_uploaded_file(uploaded_file, uploaded_file.name)
                if parse_error:
                    st.error(parse_error)
                else:
                    doc_text_to_process = extracted_text
                    st.success(f"✅ Successfully parsed `{uploaded_file.name}` ({len(doc_text_to_process):,} characters)")
                    with st.expander("👁️ Preview Extracted Document Text"):
                        st.text_area("Extracted Document Content", value=doc_text_to_process, height=220, disabled=True)
    else:
        doc_text_to_process = st.text_area(
            "Specification Content / Clause Text",
            height=260,
            placeholder="Paste technical requirements, ASME/API clauses, design criteria, or vendor deliverables here...",
        )

    st.markdown("#### ⚙️ Document Metadata & Governance")
    meta_c1, meta_c2, meta_c3 = st.columns(3)
    with meta_c1:
        doc_title = st.text_input("Document / Project Title", value=suggested_title)
    with meta_c2:
        doc_type = st.selectbox("Document Type", [
            "Standard / Specification",
            "FEED Dossier",
            "Equipment Datasheet",
            "Vendor RFP",
            "Best Practice Guideline",
        ])
    with meta_c3:
        doc_version = st.text_input("Document Revision / Version", value="Rev 1.0")

    doc_owner = st.selectbox("Assigned Document Owner / Discipline Lead", [
        "Mechanical SME",
        "Piping SME",
        "Electrical SME",
        "I&C Lead",
        "Process Lead",
        "Civil/Structural SME",
        "HSE Lead",
        "Quality Manager",
        "General Engineering Lead",
    ])

with col2:
    st.info(
        "🧠 **Gemini Extraction Worker Engine**\n\n"
        "- **Requirement** (*Shall/Must* - Mandatory)\n"
        "- **Recommendation** (*Should* - Preferred practice)\n"
        "- **Guideline** (*May* - Optional alternative)\n"
        "- **Discipline & SME Assignment**\n"
        "- **Confidence Scoring (0.0 to 1.0)**\n"
        "- **Vector Embeddings (`text-embedding-004`)**"
    )
    run_extract = st.button("🚀 Run Gemini Extraction", type="primary", use_container_width=True)

if run_extract:
    if not doc_text_to_process.strip():
        st.warning("Please upload a file or enter specification text to extract.")
    else:
        with st.spinner(f"Extracting structured requirements and scoring confidence using Gemini..."):
            try:
                batch = extract_requirements_from_text(
                    content=doc_text_to_process,
                    document_title=doc_title,
                    document_owner=doc_owner,
                )
                st.session_state["latest_batch"] = batch
                st.session_state["latest_raw_text"] = doc_text_to_process
                st.session_state["latest_doc_type"] = doc_type
                st.session_state["latest_doc_owner"] = doc_owner
                st.session_state["latest_doc_version"] = doc_version
            except Exception as e:
                st.error(f"Extraction failed: {e}")

if "latest_batch" in st.session_state:
    batch = st.session_state["latest_batch"]
    st.success(f"✅ Extracted {len(batch.items)} engineering items from '{batch.document_title}'!")
    
    if batch.executive_summary:
        st.markdown(f"**Executive Engineering Summary:**\n> {batch.executive_summary}")

    # Metrics on extraction
    m1, m2, m3, m4 = st.columns(4)
    m1.metric("Total Items Extracted", len(batch.items))
    m2.metric("Mandatory Requirements", sum(1 for i in batch.items if i.item_type.value == "Requirement"))
    m3.metric("Recommendations / Guidelines", sum(1 for i in batch.items if i.item_type.value in ("Recommendation", "Guideline")))
    low_conf_count = len(batch.low_confidence_items)
    m4.metric("Low Confidence (<0.85)", low_conf_count, delta="Needs SME Review" if low_conf_count > 0 else "All Clear", delta_color="inverse")

    if batch.items:
        items_data = [
            {
                "Code": item.requirement_code or "N/A",
                "Type": item.item_type.value,
                "Discipline": item.engineering_discipline.value,
                "Compliance": item.compliance_level.value,
                "Requirement Text": item.requirement_text,
                "Cost Impact": item.estimated_cost_impact.value,
                "Confidence": f"{item.confidence_score:.2f}",
                "Confidence Reasoning": item.confidence_reasoning or "Standard clause",
            }
            for item in batch.items
        ]
        st.dataframe(pd.DataFrame(items_data), use_container_width=True)

        if st.button("💾 Save Batch to Knowledge Base & Index pgvector", type="primary"):
            with st.spinner("Saving document, extractions, and generating pgvector embeddings..."):
                try:
                    with get_db_connection() as conn:
                        with conn.cursor() as cur:
                            cur.execute(
                                """
                                INSERT INTO documents (filename, document_type, owner_sme, version, raw_content)
                                VALUES (%s, %s, %s, %s, %s)
                                RETURNING id;
                                """,
                                (
                                    batch.document_title,
                                    st.session_state.get("latest_doc_type", "Standard"),
                                    st.session_state.get("latest_doc_owner", doc_owner),
                                    st.session_state.get("latest_doc_version", "1.0"),
                                    st.session_state.get("latest_raw_text", ""),
                                ),
                            )
                            doc_id = cur.fetchone()[0]
                        conn.commit()

                    stored_count = store_extraction_and_embeddings(
                        batch_id=batch.batch_id,
                        document_id=doc_id,
                        items=batch.items,
                    )
                    st.success(f"🎉 Successfully stored {stored_count} items and embeddings in PostgreSQL!")
                    if low_conf_count > 0:
                        st.info(f"⚠️ {low_conf_count} items have confidence score < 0.85 and are flagged in the **SME Review Queue**.")
                except Exception as e:
                    st.error(f"Error saving to database: {e}")

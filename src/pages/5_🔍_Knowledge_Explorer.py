import streamlit as st
import pandas as pd

from src.models import EngineeringDiscipline, ItemType
from src.rag import search_similar_requirements

st.set_page_config(page_title="Knowledge Explorer | Capital Engineering Copilot", page_icon="🔍", layout="wide")

st.markdown("## 🔍 Knowledge Explorer & Semantic Vector Search")
st.write("Query across past engineering requirements, FEED clauses, equipment datasheets, and standards using dense vector embeddings in pgvector.")

c1, c2, c3 = st.columns([2, 1, 1])
with c1:
    search_query = st.text_input(
        "Enter search query or specification clause to match:",
        placeholder="e.g. Mechanical seal flush plan API 682 Plan 53B for toxic service",
    )
with c2:
    filter_disc = st.selectbox("Filter Discipline", ["All"] + [d.value for d in EngineeringDiscipline])
with c3:
    filter_type = st.selectbox("Filter Type", ["All"] + [t.value for t in ItemType])

top_k = st.slider("Max Results (Top K)", min_value=1, max_value=25, value=8)

if st.button("🔍 Search Knowledge Base", type="primary"):
    if not search_query.strip():
        st.warning("Please enter a query.")
    else:
        with st.spinner("Searching pgvector embeddings..."):
            results = search_similar_requirements(
                query_text=search_query,
                top_k=top_k,
                discipline_filter=filter_disc if filter_disc != "All" else None,
                item_type_filter=filter_type if filter_type != "All" else None,
            )

            if not results:
                st.info("No matching requirements found.")
            else:
                st.success(f"Found {len(results)} matching records:")
                for r in results:
                    score_pct = f"{r.similarity_score * 100:.1f}%"
                    type_badge = f"🏷️ `{r.item_type}`"
                    st.markdown(f"""
                    ---
                    **Code:** `{r.requirement_code or 'N/A'}` | {type_badge} | **Discipline:** `{r.engineering_discipline}` | **Match Similarity:** `{score_pct}` | **Status:** `{r.status}`  
                    > {r.requirement_text}  
                    *Owner:* `{r.document_owner or 'General SME'}` | *Compliance Tier:* `{r.compliance_level}` | *Category:* `{r.category or 'General'}`
                    """)

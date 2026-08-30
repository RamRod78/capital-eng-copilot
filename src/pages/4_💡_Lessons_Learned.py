import sys
from pathlib import Path

# Ensure project root is in sys.path
root_dir = str(Path(__file__).resolve().parents[2])
if root_dir not in sys.path:
    sys.path.insert(0, root_dir)

import streamlit as st
import pandas as pd
from uuid import UUID

from src.feedback.loop import (
    fetch_feedback_lessons,
    fetch_document_flags,
    resolve_document_flag,
)

st.set_page_config(page_title="Lessons Learned | Capital Engineering Copilot", page_icon="💡", layout="wide")

st.markdown("## 💡 Closed-Loop Feedback & Lessons Learned")
st.write("Tracks SME review decisions, rejected clauses, and upstream document revision flags to continuously evolve engineering standards and agent memory.")

tab_flags, tab_feedback, tab_analytics = st.tabs([
    "🚩 Upstream Document Revision Flags",
    "📝 SME Review Feedback Log",
    "📊 Continuous Learning Analytics",
])

# --- Tab 1: Document Revision Flags ---
with tab_flags:
    st.subheader("🚩 Upstream Source Document Revision Action Items")
    st.caption("Flags raised by SMEs when source engineering standards are outdated, contradictory, or need revision.")

    c1, c2 = st.columns([2, 1])
    with c1:
        owner_filter = st.selectbox("Filter by Assigned Document Owner", [
            "All",
            "Mechanical SME",
            "Piping SME",
            "Electrical SME",
            "I&C Lead",
            "Process Lead",
            "Civil/Structural SME",
            "HSE Lead",
            "General Engineering SME",
        ])
    with c2:
        show_resolved = st.checkbox("Show Resolved Flags", value=False)

    flags_df = fetch_document_flags(owner_filter=owner_filter, show_resolved=show_resolved)

    if flags_df.empty:
        st.success("🎉 No active document revision flags! All engineering standards are up to date.")
    else:
        st.write(f"Displaying **{len(flags_df)}** revision items:")
        for idx, row in flags_df.iterrows():
            with st.container():
                col_info, col_btn = st.columns([4, 1])
                with col_info:
                    resolved_tag = "✅ [Resolved]" if row["is_resolved"] else "⚠️ [Active]"
                    st.markdown(f"### {resolved_tag} {row['document_title']}")
                    st.markdown(f"**Document Owner:** `{row['document_owner']}` | **Flagged By:** `{row['flagged_by']}` | **Date:** `{str(row['created_at'])[:10]}`")
                    st.info(f"**Issue Description:** {row['issue_description']}\n\n**Suggested Action:** `{row['suggested_action']}`")
                with col_btn:
                    st.write("")
                    st.write("")
                    if not row["is_resolved"]:
                        if st.button("Mark as Resolved", key=f"res_{row['id']}", type="primary", use_container_width=True):
                            if resolve_document_flag(UUID(str(row["id"]))):
                                st.success("Flag marked as resolved!")
                                st.rerun()
                st.markdown("---")

# --- Tab 2: Feedback Log ---
with tab_feedback:
    st.subheader("📝 SME Modifications & Rejections Log")
    st.caption("Audit log of all requirements that were edited, rejected, or reclassified during human SME review.")

    feedback_df = fetch_feedback_lessons()
    if feedback_df.empty:
        st.info("No feedback entries recorded yet.")
    else:
        st.dataframe(feedback_df, use_container_width=True)

# --- Tab 3: Analytics ---
with tab_analytics:
    st.subheader("📊 Quality & Feedback Analytics")
    fb_df = fetch_feedback_lessons()
    fl_df = fetch_document_flags(show_resolved=True)

    m1, m2, m3 = st.columns(3)
    m1.metric("Total Review Feedback Logs", len(fb_df))
    m2.metric("Total Document Flags Raised", len(fl_df))
    resolved_pct = (
        f"{(fl_df['is_resolved'].sum() / len(fl_df) * 100):.0f}%" if not fl_df.empty else "100%"
    )
    m3.metric("Flag Resolution Rate", resolved_pct)

    if not fb_df.empty:
        st.markdown("#### Review Outcomes Breakdown")
        status_counts = fb_df["final_status"].value_counts()
        st.bar_chart(status_counts)

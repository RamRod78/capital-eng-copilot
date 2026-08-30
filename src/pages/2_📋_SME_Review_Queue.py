import streamlit as st
import pandas as pd
from uuid import UUID

from src.rag import get_db_connection
from src.models import ReviewStatus, EngineeringDiscipline, ComplianceLevel, CostImpact, ItemType
from src.feedback.loop import log_feedback_entry, flag_document_for_revision

st.set_page_config(page_title="SME Review Queue | Capital Engineering Copilot", page_icon="📋", layout="wide")

st.markdown("## 📋 SME Review & Validation Queue")
st.write("Subject Matter Experts and Document Owners validate extracted clauses, review low-confidence items, resolve ambiguities, and ensure engineering accuracy.")


def fetch_extractions(status_filter=None, discipline_filter=None, owner_filter=None, low_confidence_only=False):
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
        st.error(f"Error fetching extractions: {e}")
        return pd.DataFrame()


def update_extraction_full(
    extraction_id,
    status: str,
    reviewer: str,
    item_type: str = None,
    engineering_discipline: str = None,
    compliance_level: str = None,
    estimated_cost_impact: str = None,
    category: str = None,
    requirement_text: str = None,
    sme_comments: str = None,
    original_row: dict = None,
):
    """Update all classification attributes and log feedback if modified/rejected."""
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

        # Log feedback if modified or rejected
        if original_row:
            orig_text = original_row.get("requirement_text", "")
            orig_status = original_row.get("status", "Pending Review")
            is_text_changed = requirement_text and requirement_text.strip() != orig_text.strip()
            is_rejected = status == "Rejected"
            is_edited = status == "Edited" or is_text_changed

            if is_rejected or is_edited:
                reason = sme_comments or ("Rejected during SME review" if is_rejected else "Edited specification clause")
                log_feedback_entry(
                    extraction_id=UUID(str(extraction_id)),
                    original_text=orig_text,
                    reviewed_text=requirement_text if is_text_changed else None,
                    original_status=orig_status,
                    final_status=status,
                    reviewer=reviewer,
                    reason=reason,
                )

        return True, None
    except Exception as e:
        return False, str(e)


# --- Filters Bar ---
st.sidebar.markdown("### 🧑‍💼 SME Reviewer Profile")
reviewer_name = st.sidebar.text_input("Active Reviewer Name / SME ID", value="Lead-Mechanical-SME")

f1, f2, f3, f4 = st.columns([1.5, 1.5, 1.5, 1.5])
with f1:
    status_filter = st.selectbox("Status", ["Pending Review", "All", "Approved", "Edited", "Rejected"], index=0)
with f2:
    owner_filter = st.selectbox("Document Owner / Lead", [
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
with f3:
    discipline_filter = st.selectbox("Discipline", ["All"] + [d.value for d in EngineeringDiscipline])
with f4:
    low_conf_only = st.checkbox("⚠️ Low Confidence Only (< 0.85)", value=False)

search_kw = st.text_input("🔍 Search requirements by keyword", placeholder="e.g. vessel, ASME Section VIII, 4160V, pressure relief...")

df_raw = fetch_extractions(
    status_filter=status_filter if status_filter != "All" else None,
    discipline_filter=discipline_filter if discipline_filter != "All" else None,
    owner_filter=owner_filter if owner_filter != "All" else None,
    low_confidence_only=low_conf_only,
)

if not df_raw.empty and search_kw.strip():
    kw = search_kw.strip().lower()
    df_raw = df_raw[
        df_raw["requirement_text"].str.lower().str.contains(kw)
        | df_raw["requirement_code"].fillna("").str.lower().str.contains(kw)
        | df_raw["category"].fillna("").str.lower().str.contains(kw)
    ]

if df_raw.empty:
    st.info("✨ No items found matching the selected filter criteria.")
else:
    # Summary Metrics
    m1, m2, m3, m4 = st.columns(4)
    m1.metric("Items in View", len(df_raw))
    m2.metric("Pending Review", int((df_raw["status"] == "Pending Review").sum()))
    m3.metric("Low Confidence (<0.85)", int((df_raw["confidence_score"] < 0.85).sum()))
    m4.metric("Approved / Validated", int((df_raw["status"] == "Approved").sum()))

    st.markdown("### 📝 Interactive Review Table")
    st.caption("Double-click any cell to adjust Type, Discipline, Compliance, or Review Status in-place.")

    display_df = df_raw[[
        "id",
        "status",
        "confidence_score",
        "item_type",
        "engineering_discipline",
        "compliance_level",
        "requirement_code",
        "requirement_text",
        "estimated_cost_impact",
        "document_owner",
        "sme_comments",
        "confidence_reasoning",
    ]].copy()

    column_config = {
        "id": None,
        "status": st.column_config.SelectboxColumn("Status", options=[s.value for s in ReviewStatus], required=True),
        "confidence_score": st.column_config.NumberColumn("Confidence", format="%.2f", disabled=True),
        "item_type": st.column_config.SelectboxColumn("Item Type", options=[t.value for t in ItemType], required=True),
        "engineering_discipline": st.column_config.SelectboxColumn("Discipline", options=[d.value for d in EngineeringDiscipline], required=True),
        "compliance_level": st.column_config.SelectboxColumn("Compliance", options=[c.value for c in ComplianceLevel], required=True),
        "requirement_code": st.column_config.TextColumn("Code"),
        "requirement_text": st.column_config.TextColumn("Requirement Statement", width="large"),
        "estimated_cost_impact": st.column_config.SelectboxColumn("Cost Impact", options=[ci.value for ci in CostImpact]),
        "document_owner": st.column_config.TextColumn("Doc Owner"),
        "sme_comments": st.column_config.TextColumn("SME Notes / Rationale"),
        "confidence_reasoning": st.column_config.TextColumn("Confidence Rationale", disabled=True),
    }

    edited_df = st.data_editor(
        display_df,
        column_config=column_config,
        use_container_width=True,
        num_rows="fixed",
        key="sme_review_data_editor",
    )

    act1, act2, act3 = st.columns([2, 1.5, 1.5])
    with act1:
        if st.button("💾 Save All Table Changes", type="primary", use_container_width=True):
            items_to_save = edited_df.to_dict(orient="records")
            saved_count = 0
            for it in items_to_save:
                ok, _ = update_extraction_full(
                    extraction_id=it["id"],
                    status=it.get("status", "Approved"),
                    reviewer=reviewer_name,
                    item_type=it.get("item_type"),
                    engineering_discipline=it.get("engineering_discipline"),
                    compliance_level=it.get("compliance_level"),
                    estimated_cost_impact=it.get("estimated_cost_impact"),
                    requirement_text=it.get("requirement_text"),
                    sme_comments=it.get("sme_comments"),
                )
                if ok:
                    saved_count += 1
            st.success(f"Successfully saved {saved_count} items!")
            st.rerun()

    with act2:
        if st.button("✅ Quick-Approve All Filtered", use_container_width=True):
            items_to_approve = edited_df.to_dict(orient="records")
            for it in items_to_approve:
                update_extraction_full(extraction_id=it["id"], status="Approved", reviewer=reviewer_name)
            st.success(f"Approved {len(items_to_approve)} items!")
            st.rerun()

    with act3:
        if st.button("❌ Mark All Filtered as Rejected", use_container_width=True):
            items_to_reject = edited_df.to_dict(orient="records")
            for it in items_to_reject:
                update_extraction_full(extraction_id=it["id"], status="Rejected", reviewer=reviewer_name, sme_comments="Bulk rejected by SME")
            st.warning(f"Rejected {len(items_to_reject)} items and logged to feedback lessons.")
            st.rerun()

    st.markdown("---")
    st.markdown("### 🔍 Single-Item Deep Inspection & Upstream Flagging")
    item_map = {
        f"[{row['requirement_code'] or 'REQ'}] ({row['item_type']}) {row['engineering_discipline']} | {row['requirement_text'][:60]}...": row["id"]
        for _, row in df_raw.iterrows()
    }
    selected_label = st.selectbox("Select Requirement Item to inspect:", list(item_map.keys()))
    selected_id = item_map[selected_label]
    sel_row = df_raw[df_raw["id"] == selected_id].iloc[0]

    ic1, ic2 = st.columns([2, 1])
    with ic1:
        detail_text = st.text_area("Requirement Statement", value=sel_row["requirement_text"], height=120)
        detail_comm = st.text_area("SME Notes / Validation Comments", value=sel_row["sme_comments"] or "", height=80)
        if sel_row["confidence_reasoning"]:
            st.caption(f"ℹ️ **Confidence Rationale:** {sel_row['confidence_reasoning']} (Score: {sel_row['confidence_score']:.2f})")

    with ic2:
        detail_type = st.selectbox("Item Classification", [t.value for t in ItemType], index=[t.value for t in ItemType].index(sel_row["item_type"]) if sel_row["item_type"] in [t.value for t in ItemType] else 0)
        detail_disc = st.selectbox("Engineering Discipline", [d.value for d in EngineeringDiscipline], index=[d.value for d in EngineeringDiscipline].index(sel_row["engineering_discipline"]) if sel_row["engineering_discipline"] in [d.value for d in EngineeringDiscipline] else 0)
        detail_comp = st.selectbox("Compliance Tier", [c.value for c in ComplianceLevel], index=[c.value for c in ComplianceLevel].index(sel_row["compliance_level"]) if sel_row["compliance_level"] in [c.value for c in ComplianceLevel] else 0)
        detail_stat = st.selectbox("Review Decision", [s.value for s in ReviewStatus], index=[s.value for s in ReviewStatus].index(sel_row["status"]) if sel_row["status"] in [s.value for s in ReviewStatus] else 0)

        if st.button("💾 Update Item Decision", type="primary", use_container_width=True):
            ok, err = update_extraction_full(
                extraction_id=selected_id,
                status=detail_stat,
                reviewer=reviewer_name,
                item_type=detail_type,
                engineering_discipline=detail_disc,
                compliance_level=detail_comp,
                requirement_text=detail_text,
                sme_comments=detail_comm,
                original_row=sel_row.to_dict(),
            )
            if ok:
                st.success("Item updated!")
                st.rerun()

    # Upstream source doc flag expander
    with st.expander("🚩 Flag Upstream Source Document for Revision / Deprecation"):
        st.write("If this requirement is outdated, contradictory, or superseded by a newer code, raise a flag for the source document owner.")
        flag_owner = st.text_input("Assigned Document Owner", value=sel_row["document_owner"] or "Engineering Lead")
        flag_issue = st.text_area("Issue Description", placeholder="e.g. Standard references superseded 2014 edition of API 650; requires update to 13th edition.")
        flag_action = st.selectbox("Suggested Action", ["Update Document Standard", "Deprecate Outdated Clause", "Clarify Ambiguous Requirement", "Resolve Cross-Discipline Conflict"])
        
        if st.button("🚩 Raise Revision Flag to Document Owner"):
            if not flag_issue.strip():
                st.warning("Please enter an issue description.")
            else:
                ok, err = flag_document_for_revision(
                    document_title=f"Standard for {sel_row['requirement_code'] or 'Clause'}",
                    document_owner=flag_owner,
                    flagged_by=reviewer_name,
                    issue_description=flag_issue,
                    suggested_action=flag_action,
                )
                if ok:
                    st.success("Document revision flag raised successfully!")
                else:
                    st.error(f"Error raising flag: {err}")

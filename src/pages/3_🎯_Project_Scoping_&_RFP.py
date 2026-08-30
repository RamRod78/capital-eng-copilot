import sys
from pathlib import Path

# Ensure project root is in sys.path
root_dir = str(Path(__file__).resolve().parents[2])
if root_dir not in sys.path:
    sys.path.insert(0, root_dir)

import streamlit as st
import pandas as pd
from uuid import uuid4

from src.models import (
    EngineeringDiscipline,
    ItemType,
    ComplianceLevel,
    ProjectScopeInput,
    RFPPackage,
    ScopingRequirementItem,
)
from src.scoping.agent import match_requirements_for_scope, save_project_scope_to_db
from src.scoping.exporter import export_rfp_to_markdown, export_rfp_to_csv_bytes

st.set_page_config(page_title="Project Scoping & RFP | Capital Engineering Copilot", page_icon="🎯", layout="wide")

st.markdown("## 🎯 Capital Project Scoping & RFP Generator Agent")
st.write("Ingest high-level project scopes, match mandatory engineering specs, recommended best practices, and guidelines from your knowledge base, and assemble an RFP / SOW package for external engineering providers.")

tab_new_scope, tab_curate_rfp, tab_export_rfp = st.tabs([
    "1. Define Project Scope",
    "2. Curate Matched Requirements",
    "3. Preview & Export Vendor RFP",
])

# --- Tab 1: Define Project Scope ---
with tab_new_scope:
    st.subheader("📋 Ingest Capital Project Requirements")
    
    col1, col2 = st.columns([2, 1])
    with col1:
        proj_name = st.text_input("Project Name / Scope Title", value="Project Alpha: Crude Distillation Unit (CDU) Modernization")
        proj_code = st.text_input("Project Code / AFE #", value="AFE-2026-CDU-04")
        facility_type = st.selectbox("Facility / Process Unit Type", [
            "Refining / Distillation Unit",
            "Petrochemical Processing",
            "Natural Gas Compression Station",
            "Hydrogen Production & Storage",
            "Water Treatment & Desalination",
            "Offshore Platform / Topsides",
            "Battery Energy Storage System (BESS)",
            "General Industrial Facility",
        ])
        operating_cond = st.text_input(
            "Key Operating Conditions & Design Basis",
            value="Operating Pressure: 450 psig; Design Temp: 750°F; Sour Service (H2S); Class 1 Div 2 Area",
        )
        scope_desc = st.text_area(
            "Project Scope Description & Boundary Limits",
            height=200,
            value=(
                "Engineering, Procurement, and Construction (EPC) scope for replacing three column reflux pumps, "
                "upgrading high-pressure heat exchangers to ASME Section VIII Div 2 standards, installing 4160V switchgear, "
                "and integrating automated safety instrumented systems (SIS) SIL-2 loops with existing plant DCS."
            ),
        )

    with col2:
        st.markdown("#### 🎯 Target Disciplines")
        selected_disciplines = []
        for disc in EngineeringDiscipline:
            if st.checkbox(disc.value, value=(disc in [
                EngineeringDiscipline.MECHANICAL,
                EngineeringDiscipline.PIPING,
                EngineeringDiscipline.ELECTRICAL,
                EngineeringDiscipline.INSTRUMENTATION_CONTROLS,
                EngineeringDiscipline.PROCESS_SAFETY_HSE,
            ])):
                selected_disciplines.append(disc)

        top_k = st.slider("Max candidate items per discipline", 5, 25, 10)
        run_scoping = st.button("🚀 Match Knowledge & Assemble RFP", type="primary", use_container_width=True)

    if run_scoping:
        if not proj_name.strip() or not scope_desc.strip():
            st.warning("Please provide a project name and scope description.")
        else:
            with st.spinner("Analyzing scope and searching hybrid vector/graph knowledge database..."):
                scope_input = ProjectScopeInput(
                    project_name=proj_name,
                    project_code=proj_code,
                    facility_type=facility_type,
                    operating_conditions=operating_cond,
                    disciplines=selected_disciplines,
                    scope_description=scope_desc,
                )
                try:
                    package = match_requirements_for_scope(scope_input, top_k_per_discipline=top_k)
                    st.session_state["scoping_package"] = package
                    st.session_state["scope_input"] = scope_input
                    st.success(f"Matched {len(package.mandatory_requirements)} Mandatory Specs, {len(package.recommendations)} Recommendations, and {len(package.guidelines)} Guidelines!")
                except Exception as e:
                    st.error(f"Error during requirement matching: {e}")

# --- Tab 2: Curate Matched Requirements ---
with tab_curate_rfp:
    st.subheader("🔍 Review & Curate Matched Requirements")
    if "scoping_package" not in st.session_state:
        st.info("👈 Please define and run a project scope in Step 1 first.")
    else:
        pkg: RFPPackage = st.session_state["scoping_package"]
        st.write(f"**Project:** `{pkg.project_name}` | **Facility:** `{pkg.facility_type}`")

        col_m, col_r, col_g = st.columns(3)
        col_m.metric("Mandatory Requirements", len(pkg.mandatory_requirements))
        col_r.metric("Recommended Practices", len(pkg.recommendations))
        col_g.metric("Optional Guidelines", len(pkg.guidelines))

        st.markdown("#### 🔴 Section A: Mandatory Technical Specifications")
        if pkg.mandatory_requirements:
            for idx, item in enumerate(pkg.mandatory_requirements):
                c_chk, c_body = st.columns([0.5, 9.5])
                with c_chk:
                    item.is_selected = st.checkbox("Include", value=item.is_selected, key=f"mand_{idx}")
                with c_body:
                    st.markdown(f"**[{item.engineering_discipline.value}]** `{item.requirement_code or 'REQ'}`: {item.requirement_text}")
                    item.custom_notes = st.text_input(
                        "Project-Specific Clarification / Note",
                        value=item.custom_notes or "",
                        key=f"mand_note_{idx}",
                        placeholder="Add custom notes for this RFP item...",
                    )
        else:
            st.info("No mandatory requirements found.")

        st.markdown("#### 🟡 Section B: Recommended Best Practices")
        if pkg.recommendations:
            for idx, item in enumerate(pkg.recommendations):
                c_chk, c_body = st.columns([0.5, 9.5])
                with c_chk:
                    item.is_selected = st.checkbox("Include", value=item.is_selected, key=f"rec_{idx}")
                with c_body:
                    st.markdown(f"**[{item.engineering_discipline.value}]** `{item.requirement_code or 'REC'}`: {item.requirement_text}")
                    item.custom_notes = st.text_input(
                        "Project-Specific Clarification / Note",
                        value=item.custom_notes or "",
                        key=f"rec_note_{idx}",
                        placeholder="Add custom notes for this RFP item...",
                    )
        else:
            st.info("No recommended practices found.")

        st.markdown("#### 🟢 Section C: Optional Scope Options & Guidelines")
        if pkg.guidelines:
            for idx, item in enumerate(pkg.guidelines):
                c_chk, c_body = st.columns([0.5, 9.5])
                with c_chk:
                    item.is_selected = st.checkbox("Include", value=item.is_selected, key=f"gdl_{idx}")
                with c_body:
                    st.markdown(f"**[{item.engineering_discipline.value}]** `{item.requirement_code or 'GDL'}`: {item.requirement_text}")
                    item.custom_notes = st.text_input(
                        "Project-Specific Clarification / Note",
                        value=item.custom_notes or "",
                        key=f"gdl_note_{idx}",
                        placeholder="Add custom notes for this RFP item...",
                    )
        else:
            st.info("No optional guidelines found.")

# --- Tab 3: Preview & Export Vendor RFP ---
with tab_export_rfp:
    st.subheader("📄 Vendor-Ready RFP & SOW Package")
    if "scoping_package" not in st.session_state:
        st.info("👈 Please define and run a project scope in Step 1 first.")
    else:
        pkg: RFPPackage = st.session_state["scoping_package"]
        
        # Filter only selected items
        curated_pkg = RFPPackage(
            package_id=pkg.package_id,
            project_name=pkg.project_name,
            project_code=pkg.project_code,
            facility_type=pkg.facility_type,
            scope_summary=pkg.scope_summary,
            mandatory_requirements=[i for i in pkg.mandatory_requirements if i.is_selected],
            recommendations=[i for i in pkg.recommendations if i.is_selected],
            guidelines=[i for i in pkg.guidelines if i.is_selected],
        )

        md_content = export_rfp_to_markdown(curated_pkg)
        csv_bytes = export_rfp_to_csv_bytes(curated_pkg)

        col_d1, col_d2, col_d3 = st.columns([1.5, 1.5, 2])
        with col_d1:
            st.download_button(
                "📥 Download RFP (Markdown)",
                data=md_content,
                file_name=f"RFP_{pkg.project_code or 'Scope'}.md",
                mime="text/markdown",
                use_container_width=True,
            )
        with col_d2:
            st.download_button(
                "📊 Download Matrix (CSV)",
                data=csv_bytes,
                file_name=f"ScopingMatrix_{pkg.project_code or 'Scope'}.csv",
                mime="text/csv",
                use_container_width=True,
            )
        with col_d3:
            if st.button("💾 Save RFP Package to PostgreSQL Database", type="primary", use_container_width=True):
                try:
                    scope_id = save_project_scope_to_db(curated_pkg)
                    st.success(f"🎉 RFP Package saved successfully to database (Scope ID: `{scope_id}`)!")
                except Exception as e:
                    st.error(f"Error saving RFP to database: {e}")

        st.markdown("---")
        st.markdown("### 📑 Formatted RFP Preview")
        st.markdown(md_content)

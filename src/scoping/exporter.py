import io
import pandas as pd
from typing import List
from datetime import datetime
from src.models import RFPPackage, ScopingRequirementItem


def export_rfp_to_markdown(package: RFPPackage) -> str:
    """Generate a clean, vendor-ready Markdown RFP / Scope of Work specification document."""
    lines = []
    lines.append(f"# REQUEST FOR PROPOSAL (RFP) & SCOPE OF WORK")
    lines.append(f"**Project Title:** {package.project_name}")
    if package.project_code:
        lines.append(f"**Project Code / AFE:** {package.project_code}")
    lines.append(f"**Facility / Asset Type:** {package.facility_type}")
    lines.append(f"**Date Issued:** {package.created_at.strftime('%Y-%m-%d')}")
    lines.append(f"**Prepared By:** {package.generated_by}")
    lines.append("\n---\n")

    lines.append("## 1. Executive Project Summary & Scope Boundaries")
    lines.append(package.scope_summary)
    lines.append("\n---\n")

    # Section 2: Mandatory Engineering Requirements
    lines.append("## 2. Section A: Mandatory Technical Specifications (Shall/Must)")
    lines.append("The Engineering Provider must fully adhere to all design codes, safety criteria, and technical constraints listed below without deviation unless formal management variance is granted.")
    lines.append("")
    if package.mandatory_requirements:
        for idx, item in enumerate(package.mandatory_requirements, start=1):
            code_str = f"`{item.requirement_code}` - " if item.requirement_code else ""
            disc_str = f"**[{item.engineering_discipline.value}]**"
            lines.append(f"{idx}. {disc_str} {code_str}{item.requirement_text}")
            if item.custom_notes:
                lines.append(f"   *Project Note: {item.custom_notes}*")
    else:
        lines.append("*No mandatory requirements specified in this section.*")
    lines.append("\n---\n")

    # Section 3: Recommended Practices & Equipment Margins
    lines.append("## 3. Section B: Recommended Engineering Best Practices (Should)")
    lines.append("These items represent organizational engineering best practices, vendor preferences, and design margins. Deviations must be documented in the technical bid clarification log.")
    lines.append("")
    if package.recommendations:
        for idx, item in enumerate(package.recommendations, start=1):
            code_str = f"`{item.requirement_code}` - " if item.requirement_code else ""
            disc_str = f"**[{item.engineering_discipline.value}]**"
            lines.append(f"{idx}. {disc_str} {code_str}{item.requirement_text}")
            if item.custom_notes:
                lines.append(f"   *Project Note: {item.custom_notes}*")
    else:
        lines.append("*No recommended best practices listed.*")
    lines.append("\n---\n")

    # Section 4: Optional Guidelines & Alternative Scopes
    lines.append("## 4. Section C: Optional Scope Options & Guidelines (May)")
    lines.append("Optional scope provisions and design options for vendor optimization or alternate bid pricing.")
    lines.append("")
    if package.guidelines:
        for idx, item in enumerate(package.guidelines, start=1):
            code_str = f"`{item.requirement_code}` - " if item.requirement_code else ""
            disc_str = f"**[{item.engineering_discipline.value}]**"
            lines.append(f"{idx}. {disc_str} {code_str}{item.requirement_text}")
            if item.custom_notes:
                lines.append(f"   *Project Note: {item.custom_notes}*")
    else:
        lines.append("*No optional guidelines listed.*")
    lines.append("\n---\n")

    # Section 5: Vendor Compliance & Submittal Sign-Off
    lines.append("## 5. Vendor Compliance & Sign-Off")
    lines.append("The undersigned engineering contractor acknowledges receipt and compliance with the technical scope described above.")
    lines.append("\n| Role | Name / Title | Company | Signature / Date |")
    lines.append("| :--- | :--- | :--- | :--- |")
    lines.append("| Lead Contractor Engineer | | | |")
    lines.append("| Client Project Manager | | | |")

    return "\n".join(lines)


def export_rfp_to_dataframe(package: RFPPackage) -> pd.DataFrame:
    """Export the requirements in the package into a tabular DataFrame."""
    rows = []
    all_items = [
        ("Mandatory Requirement", package.mandatory_requirements),
        ("Recommendation", package.recommendations),
        ("Guideline", package.guidelines),
    ]

    for section_name, items in all_items:
        for it in items:
            rows.append({
                "Section": section_name,
                "Code": it.requirement_code or "N/A",
                "Discipline": it.engineering_discipline.value if hasattr(it.engineering_discipline, "value") else str(it.engineering_discipline),
                "Compliance": it.compliance_level.value if hasattr(it.compliance_level, "value") else str(it.compliance_level),
                "Requirement Statement": it.requirement_text,
                "Selected": it.is_selected,
                "Custom Notes": it.custom_notes or "",
            })
    return pd.DataFrame(rows)


def export_rfp_to_csv_bytes(package: RFPPackage) -> bytes:
    """Generate CSV bytes for browser download."""
    df = export_rfp_to_dataframe(package)
    return df.to_csv(index=False).encode("utf-8")

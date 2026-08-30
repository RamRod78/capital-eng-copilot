import unittest
from unittest.mock import MagicMock, patch
from uuid import uuid4

from src.models import (
    EngineeringDiscipline,
    ComplianceLevel,
    ItemType,
    ProjectScopeInput,
    RFPPackage,
    ScopingRequirementItem,
    SearchResult,
)
from src.scoping.agent import match_requirements_for_scope
from src.scoping.exporter import export_rfp_to_markdown, export_rfp_to_dataframe, export_rfp_to_csv_bytes


class TestScoping(unittest.TestCase):

    @patch("src.scoping.agent.search_similar_requirements")
    def test_match_requirements_for_scope(self, mock_search):
        # Mock returned search results
        mock_search.return_value = [
            SearchResult(
                extraction_id=uuid4(),
                requirement_code="REQ-MEC-101",
                requirement_text="Centrifugal pumps shall be designed to API 610.",
                item_type="Requirement",
                category="Pumps",
                engineering_discipline="Mechanical",
                compliance_level="Mandatory",
                similarity_score=0.92,
                status="Approved",
            ),
            SearchResult(
                extraction_id=uuid4(),
                requirement_code="REC-ELE-202",
                requirement_text="Variable frequency drives should include bypass contactors.",
                item_type="Recommendation",
                category="Electrical",
                engineering_discipline="Electrical",
                compliance_level="Recommended",
                similarity_score=0.88,
                status="Approved",
            ),
            SearchResult(
                extraction_id=uuid4(),
                requirement_code="GDL-PIP-303",
                requirement_text="Consider 316L stainless steel for corrosive sampling points.",
                item_type="Guideline",
                category="Piping",
                engineering_discipline="Piping",
                compliance_level="Optional",
                similarity_score=0.81,
                status="Approved",
            ),
        ]

        scope_input = ProjectScopeInput(
            project_name="Crude Unit Expansion",
            project_code="AFE-100",
            facility_type="Refinery",
            disciplines=[EngineeringDiscipline.MECHANICAL, EngineeringDiscipline.ELECTRICAL],
            scope_description="Installing new API 610 pumps and VFD drives.",
        )

        package = match_requirements_for_scope(scope_input)
        self.assertIsInstance(package, RFPPackage)
        self.assertEqual(package.project_name, "Crude Unit Expansion")
        self.assertEqual(len(package.mandatory_requirements), 1)
        self.assertEqual(len(package.recommendations), 1)
        self.assertEqual(len(package.guidelines), 1)

    def test_export_rfp_to_markdown_and_dataframe(self):
        pkg = RFPPackage(
            project_name="Water Treatment Plant",
            project_code="WTP-01",
            facility_type="Water Treatment",
            scope_summary="Installation of reverse osmosis filtration skid.",
            mandatory_requirements=[
                ScopingRequirementItem(
                    requirement_code="REQ-WTP-001",
                    requirement_text="Tanks shall be ASME Section VIII Div 1 certified.",
                    item_type=ItemType.REQUIREMENT,
                    engineering_discipline=EngineeringDiscipline.MECHANICAL,
                    compliance_level=ComplianceLevel.MANDATORY,
                )
            ],
            recommendations=[
                ScopingRequirementItem(
                    requirement_code="REC-WTP-002",
                    requirement_text="Pumps should include vibration monitoring sensors.",
                    item_type=ItemType.RECOMMENDATION,
                    engineering_discipline=EngineeringDiscipline.INSTRUMENTATION_CONTROLS,
                    compliance_level=ComplianceLevel.RECOMMENDED,
                )
            ],
            guidelines=[],
        )

        md_output = export_rfp_to_markdown(pkg)
        self.assertIn("REQUEST FOR PROPOSAL (RFP)", md_output)
        self.assertIn("REQ-WTP-001", md_output)
        self.assertIn("REC-WTP-002", md_output)

        df = export_rfp_to_dataframe(pkg)
        self.assertEqual(len(df), 2)
        self.assertIn("Requirement Statement", df.columns)

        csv_bytes = export_rfp_to_csv_bytes(pkg)
        self.assertGreater(len(csv_bytes), 0)


if __name__ == "__main__":
    unittest.main()

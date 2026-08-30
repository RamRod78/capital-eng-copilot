import unittest
from uuid import uuid4
from pydantic import ValidationError

from src.models import (
    ComplianceLevel,
    CostImpact,
    EngineeringDiscipline,
    ExtractionBatch,
    ExtractionItem,
    ItemType,
    ReviewStatus,
    SMEReviewUpdate,
    ProjectScopeInput,
    RFPPackage,
    ScopingRequirementItem,
    FeedbackEntry,
    DocumentRevisionFlag,
)


class TestModels(unittest.TestCase):

    def test_extraction_item_valid(self):
        item = ExtractionItem(
            section_title="4.2 Pressure Piping",
            requirement_code="REQ-PIP-001",
            requirement_text="All process piping shall conform to ASME B31.3 Category D or M fluid service.",
            item_type=ItemType.REQUIREMENT,
            category="Piping",
            engineering_discipline=EngineeringDiscipline.PIPING,
            compliance_level=ComplianceLevel.MANDATORY,
            estimated_cost_impact=CostImpact.MEDIUM,
            document_owner="Piping SME",
            confidence_score=0.98,
            confidence_reasoning="Direct ASME B31.3 mandatory specification",
        )
        self.assertEqual(item.requirement_code, "REQ-PIP-001")
        self.assertEqual(item.item_type, ItemType.REQUIREMENT)
        self.assertEqual(item.engineering_discipline, EngineeringDiscipline.PIPING)
        self.assertEqual(item.compliance_level, ComplianceLevel.MANDATORY)
        self.assertEqual(item.document_owner, "Piping SME")
        self.assertEqual(item.confidence_score, 0.98)

    def test_extraction_item_validation_empty_text(self):
        with self.assertRaises(ValidationError):
            ExtractionItem(
                requirement_text="   ",
                engineering_discipline=EngineeringDiscipline.MECHANICAL,
            )

    def test_extraction_batch_serialization_and_low_confidence(self):
        batch = ExtractionBatch(
            document_title="Unit 4 FEED Specification",
            document_owner="Mechanical Lead",
            executive_summary="Scope covering centrifugal pump packages and electrical transformers.",
            identified_disciplines=[EngineeringDiscipline.MECHANICAL, EngineeringDiscipline.ELECTRICAL],
            items=[
                ExtractionItem(
                    section_title="Pump Specs",
                    requirement_code="REQ-MEC-01",
                    requirement_text="Pumps shall comply with API 610 12th Edition.",
                    item_type=ItemType.REQUIREMENT,
                    engineering_discipline=EngineeringDiscipline.MECHANICAL,
                    compliance_level=ComplianceLevel.MANDATORY,
                    estimated_cost_impact=CostImpact.HIGH,
                    confidence_score=0.95,
                ),
                ExtractionItem(
                    section_title="Unclear Spec",
                    requirement_code="REC-ELE-02",
                    requirement_text="Transformer sizing should be determined based on future load growth.",
                    item_type=ItemType.RECOMMENDATION,
                    engineering_discipline=EngineeringDiscipline.ELECTRICAL,
                    compliance_level=ComplianceLevel.RECOMMENDED,
                    estimated_cost_impact=CostImpact.MEDIUM,
                    confidence_score=0.72,
                    confidence_reasoning="Ambiguous load criteria",
                ),
            ],
        )
        self.assertEqual(batch.total_items, 2)
        self.assertEqual(len(batch.low_confidence_items), 1)
        self.assertEqual(batch.low_confidence_items[0].requirement_code, "REC-ELE-02")

        # Round-trip JSON validation
        json_data = batch.model_dump_json()
        self.assertIn("API 610", json_data)
        parsed = ExtractionBatch.model_validate_json(json_data)
        self.assertEqual(parsed.document_title, "Unit 4 FEED Specification")
        self.assertEqual(len(parsed.items), 2)

    def test_project_scoping_and_rfp_models(self):
        scope_input = ProjectScopeInput(
            project_name="Distillation Unit Upgrade",
            facility_type="Refinery",
            disciplines=[EngineeringDiscipline.MECHANICAL, EngineeringDiscipline.PIPING],
            scope_description="Replacing 3 crude feed pumps and upgrading piping.",
        )
        self.assertEqual(scope_input.project_name, "Distillation Unit Upgrade")
        self.assertEqual(len(scope_input.disciplines), 2)

        rfp_pkg = RFPPackage(
            project_name=scope_input.project_name,
            facility_type=scope_input.facility_type,
            scope_summary=scope_input.scope_description,
            mandatory_requirements=[
                ScopingRequirementItem(
                    requirement_code="REQ-MEC-001",
                    requirement_text="API 610 pumps required.",
                    item_type=ItemType.REQUIREMENT,
                    engineering_discipline=EngineeringDiscipline.MECHANICAL,
                    compliance_level=ComplianceLevel.MANDATORY,
                )
            ],
        )
        self.assertEqual(len(rfp_pkg.mandatory_requirements), 1)

    def test_feedback_and_document_flag_models(self):
        flag = DocumentRevisionFlag(
            document_title="API 650 Storage Tanks Standard",
            document_owner="Mechanical SME",
            flagged_by="Senior Lead Engineer",
            issue_description="Clause 4.2 references obsolete edition.",
            suggested_action="Update to 13th Edition",
        )
        self.assertEqual(flag.document_owner, "Mechanical SME")
        self.assertFalse(flag.is_resolved)


if __name__ == "__main__":
    unittest.main()

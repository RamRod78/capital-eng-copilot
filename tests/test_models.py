import unittest
from uuid import uuid4
from pydantic import ValidationError

from src.models import (
    ComplianceLevel,
    CostImpact,
    EngineeringDiscipline,
    ExtractionBatch,
    ExtractionItem,
    ReviewStatus,
    SMEReviewUpdate,
)


class TestModels(unittest.TestCase):

    def test_extraction_item_valid(self):
        item = ExtractionItem(
            section_title="4.2 Pressure Piping",
            requirement_code="REQ-PIP-001",
            requirement_text="All process piping shall conform to ASME B31.3 Category D or M fluid service.",
            category="Piping",
            engineering_discipline=EngineeringDiscipline.PIPING,
            compliance_level=ComplianceLevel.MANDATORY,
            estimated_cost_impact=CostImpact.MEDIUM,
            confidence_score=0.98,
        )
        self.assertEqual(item.requirement_code, "REQ-PIP-001")
        self.assertEqual(item.engineering_discipline, EngineeringDiscipline.PIPING)
        self.assertEqual(item.compliance_level, ComplianceLevel.MANDATORY)
        self.assertEqual(item.estimated_cost_impact, CostImpact.MEDIUM)
        self.assertEqual(item.confidence_score, 0.98)

    def test_extraction_item_validation_empty_text(self):
        with self.assertRaises(ValidationError):
            ExtractionItem(
                requirement_text="   ",
                engineering_discipline=EngineeringDiscipline.MECHANICAL,
            )

    def test_extraction_batch_serialization(self):
        batch = ExtractionBatch(
            document_title="Unit 4 FEED Specification",
            executive_summary="Scope covering centrifugal pump packages and electrical transformers.",
            identified_disciplines=[EngineeringDiscipline.MECHANICAL, EngineeringDiscipline.ELECTRICAL],
            items=[
                ExtractionItem(
                    section_title="Pump Specs",
                    requirement_code="REQ-MEC-01",
                    requirement_text="Pumps shall comply with API 610 12th Edition.",
                    engineering_discipline=EngineeringDiscipline.MECHANICAL,
                    compliance_level=ComplianceLevel.MANDATORY,
                    estimated_cost_impact=CostImpact.HIGH,
                    confidence_score=0.95,
                )
            ],
        )
        self.assertEqual(batch.total_items, 1)
        json_data = batch.model_dump_json()
        self.assertIn("API 610", json_data)

        # Round-trip parsing
        parsed = ExtractionBatch.model_validate_json(json_data)
        self.assertEqual(parsed.document_title, "Unit 4 FEED Specification")
        self.assertEqual(len(parsed.items), 1)
        self.assertEqual(parsed.items[0].engineering_discipline, EngineeringDiscipline.MECHANICAL)

    def test_sme_review_update_model(self):
        ex_id = uuid4()
        update = SMEReviewUpdate(
            extraction_id=ex_id,
            status=ReviewStatus.APPROVED,
            sme_reviewer="Lead-Piping-SME",
            sme_comments="Approved for FEED phase; check nozzle loads in detailed engineering.",
        )
        self.assertEqual(update.status, ReviewStatus.APPROVED)
        self.assertEqual(update.sme_reviewer, "Lead-Piping-SME")


if __name__ == "__main__":
    unittest.main()

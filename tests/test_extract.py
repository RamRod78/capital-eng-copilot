import unittest
from unittest.mock import MagicMock

from src.extract import extract_requirements_from_text, extract_requirements_from_chunks
from src.models import ComplianceLevel, CostImpact, EngineeringDiscipline, ExtractionBatch


class TestExtract(unittest.TestCase):

    def test_extract_empty_content_raises(self):
        with self.assertRaises(ValueError):
            extract_requirements_from_text("")

    def test_extract_requirements_from_text_mocked_gemini(self):
        mock_client = MagicMock()
        mock_response = MagicMock()

        mock_json = """{
            "batch_id": "test-batch-123",
            "document_title": "Project Alpha FEED Dossier",
            "executive_summary": "Requirements for medium voltage switchgear and protection relays.",
            "identified_disciplines": ["Electrical", "I&C"],
            "items": [
                {
                    "section_title": "Section 5.1 Switchgear",
                    "requirement_code": "REQ-ELE-001",
                    "requirement_text": "Main 13.8kV switchgear shall be arc-resistant Type 2B per IEEE C37.20.7.",
                    "category": "Switchgear",
                    "engineering_discipline": "Electrical",
                    "compliance_level": "Mandatory",
                    "estimated_cost_impact": "High",
                    "confidence_score": 0.99
                },
                {
                    "section_title": "Section 5.4 Relays",
                    "requirement_code": "REQ-IC-002",
                    "requirement_text": "Protection relays should support IEC 61850 protocol over dual redundant fiber links.",
                    "category": "Substation Automation",
                    "engineering_discipline": "I&C",
                    "compliance_level": "Recommended",
                    "estimated_cost_impact": "Medium",
                    "confidence_score": 0.92
                }
            ]
        }"""

        mock_response.text = mock_json
        mock_client.models.generate_content.return_value = mock_response

        sample_doc = "All 13.8kV switchgear shall be arc-resistant Type 2B per IEEE C37.20.7. Relays should support IEC 61850."
        batch = extract_requirements_from_text(
            content=sample_doc,
            document_title="Project Alpha FEED Dossier",
            model="gemini-2.5-flash",
            client=mock_client,
        )

        self.assertIsInstance(batch, ExtractionBatch)
        self.assertEqual(batch.document_title, "Project Alpha FEED Dossier")
        self.assertEqual(len(batch.items), 2)
        self.assertEqual(batch.items[0].requirement_code, "REQ-ELE-001")
        self.assertEqual(batch.items[0].engineering_discipline, EngineeringDiscipline.ELECTRICAL)
        self.assertEqual(batch.items[0].compliance_level, ComplianceLevel.MANDATORY)
        self.assertEqual(batch.items[0].estimated_cost_impact, CostImpact.HIGH)
        self.assertEqual(batch.items[1].engineering_discipline, EngineeringDiscipline.INSTRUMENTATION_CONTROLS)
        self.assertEqual(batch.items[1].compliance_level, ComplianceLevel.RECOMMENDED)

        # Verify Gemini call arguments
        mock_client.models.generate_content.assert_called_once()
        _, kwargs = mock_client.models.generate_content.call_args
        self.assertEqual(kwargs["model"], "gemini-2.5-flash")
        self.assertEqual(kwargs["config"].response_schema, ExtractionBatch)


if __name__ == "__main__":
    unittest.main()

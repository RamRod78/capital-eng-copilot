import unittest
from unittest.mock import MagicMock, patch
from uuid import uuid4

from src.models import ReviewStatus, EngineeringDiscipline, ComplianceLevel, CostImpact
from src.rag import update_extraction_full, bulk_update_extractions


class TestReviewQueue(unittest.TestCase):

    @patch("src.rag.get_db_connection")
    def test_update_extraction_full_success(self, mock_get_db):
        mock_conn = MagicMock()
        mock_cur = MagicMock()
        mock_conn.cursor.return_value.__enter__.return_value = mock_cur
        mock_conn.__enter__.return_value = mock_conn
        mock_get_db.return_value = mock_conn

        test_id = uuid4()
        ok, err = update_extraction_full(
            extraction_id=test_id,
            status="Approved",
            reviewer="SME-Piping",
            item_type="Requirement",
            engineering_discipline="Piping",
            compliance_level="Mandatory",
            estimated_cost_impact="High",
            requirement_text="Updated piping requirement text",
            sme_comments="Approved with updated spec",
        )

        self.assertTrue(ok)
        self.assertIsNone(err)
        mock_cur.execute.assert_called_once()
        mock_conn.commit.assert_called_once()

    @patch("src.rag.get_db_connection")
    def test_bulk_update_extractions_success(self, mock_get_db):
        mock_conn = MagicMock()
        mock_cur = MagicMock()
        mock_conn.cursor.return_value.__enter__.return_value = mock_cur
        mock_conn.__enter__.return_value = mock_conn
        mock_get_db.return_value = mock_conn

        items = [
            {
                "id": str(uuid4()),
                "status": "Approved",
                "item_type": "Requirement",
                "engineering_discipline": "Electrical",
                "compliance_level": "Mandatory",
                "estimated_cost_impact": "High",
                "requirement_text": "Spec 1",
                "sme_comments": "Looks good",
                "category": "Power",
            },
            {
                "id": str(uuid4()),
                "status": "Edited",
                "item_type": "Recommendation",
                "engineering_discipline": "I&C",
                "compliance_level": "Recommended",
                "estimated_cost_impact": "Medium",
                "requirement_text": "Spec 2 edited",
                "sme_comments": "Changed discipline to I&C",
                "category": "DCS",
            },
        ]

        count, errors = bulk_update_extractions(items, reviewer="Lead-SME")
        self.assertEqual(count, 2)
        self.assertEqual(len(errors), 0)
        self.assertEqual(mock_cur.execute.call_count, 2)
        mock_conn.commit.assert_called_once()


if __name__ == "__main__":
    unittest.main()

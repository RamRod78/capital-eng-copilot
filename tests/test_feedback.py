import unittest
from unittest.mock import MagicMock, patch
from uuid import uuid4

from src.feedback.loop import (
    log_feedback_entry,
    flag_document_for_revision,
    resolve_document_flag,
)


class TestFeedback(unittest.TestCase):

    @patch("src.feedback.loop.get_db_connection")
    def test_log_feedback_entry(self, mock_get_db):
        mock_conn = MagicMock()
        mock_cur = MagicMock()
        mock_conn.cursor.return_value.__enter__.return_value = mock_cur
        mock_conn.__enter__.return_value = mock_conn
        mock_get_db.return_value = mock_conn

        ok = log_feedback_entry(
            original_text="Old clause text",
            reviewed_text="New updated clause text",
            original_status="Pending Review",
            final_status="Edited",
            reviewer="Mechanical-SME",
            reason="Corrected design pressure to 600 psig",
            extraction_id=uuid4(),
        )
        self.assertTrue(ok)
        mock_cur.execute.assert_called_once()
        mock_conn.commit.assert_called_once()

    @patch("src.feedback.loop.get_db_connection")
    def test_flag_document_for_revision(self, mock_get_db):
        mock_conn = MagicMock()
        mock_cur = MagicMock()
        mock_conn.cursor.return_value.__enter__.return_value = mock_cur
        mock_conn.__enter__.return_value = mock_conn
        mock_get_db.return_value = mock_conn

        ok, err = flag_document_for_revision(
            document_title="API 610 Centrifugal Pumps Spec",
            document_owner="Mechanical Lead",
            flagged_by="SME Reviewer",
            issue_description="Clause 6.1 requires revision to latest edition",
            suggested_action="Update Standard",
        )
        self.assertTrue(ok)
        self.assertIsNone(err)
        mock_cur.execute.assert_called_once()
        mock_conn.commit.assert_called_once()

    @patch("src.feedback.loop.get_db_connection")
    def test_resolve_document_flag(self, mock_get_db):
        mock_conn = MagicMock()
        mock_cur = MagicMock()
        mock_conn.cursor.return_value.__enter__.return_value = mock_cur
        mock_conn.__enter__.return_value = mock_conn
        mock_get_db.return_value = mock_conn

        ok = resolve_document_flag(uuid4())
        self.assertTrue(ok)
        mock_cur.execute.assert_called_once()
        mock_conn.commit.assert_called_once()


if __name__ == "__main__":
    unittest.main()

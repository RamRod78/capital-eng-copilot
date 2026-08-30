import unittest
import io
from src.parsers import parse_uploaded_file


class TestParsers(unittest.TestCase):

    def test_parse_text_file(self):
        text_content = b"All pumps shall meet API 610 standards.\nDesign temperature 350F."
        file_obj = io.BytesIO(text_content)
        text, err = parse_uploaded_file(file_obj, "specification.txt")
        self.assertIsNone(err)
        self.assertIn("API 610", text)

    def test_parse_csv_file(self):
        csv_content = b"Code,Discipline,Requirement\nREQ-01,Mechanical,API 610 Pump\nREQ-02,Electrical,4160V VFD"
        file_obj = io.BytesIO(csv_content)
        text, err = parse_uploaded_file(file_obj, "equipment_list.csv")
        self.assertIsNone(err)
        self.assertIn("API 610", text)
        self.assertIn("4160V VFD", text)

    def test_parse_empty_file_object(self):
        text, err = parse_uploaded_file(None, "empty.txt")
        self.assertEqual(text, "")
        self.assertIsNotNone(err)


if __name__ == "__main__":
    unittest.main()

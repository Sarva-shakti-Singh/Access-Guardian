import unittest

from backend.app.services.ai.verify import (
    VerificationError,
    classify_verification,
    validate_verification_element,
)


class VerifyValidationTests(unittest.TestCase):
    def test_accepts_single_modified_element(self):
        element = '<img src="photo.png" alt="Mountain">'
        self.assertEqual(validate_verification_element(element), element)

    def test_rejects_empty_embedded_or_oversized_element(self):
        cases = [
            "",
            "<script>alert(1)</script>",
            "<iframe src=\"https://example.com\"></iframe>",
            "<img alt=\"" + ("x" * 5001) + "\">",
        ]
        for element in cases:
            with self.subTest(element=element[:30]):
                with self.assertRaises(VerificationError):
                    validate_verification_element(element)

    def test_rejects_partial_element_and_accepts_void_element(self):
        with self.assertRaises(VerificationError):
            validate_verification_element("<button>Save")
        self.assertEqual(
            validate_verification_element('<img src="photo.png" alt="A photo">'),
            '<img src="photo.png" alt="A photo">',
        )

    def test_classifies_verification_evidence(self):
        self.assertEqual(classify_verification(2, 0)["outcome"], "unresolved")
        self.assertEqual(classify_verification(0, 1)["outcome"], "partially_resolved")
        self.assertEqual(classify_verification(0, 0)["outcome"], "resolved")


if __name__ == "__main__":
    unittest.main()

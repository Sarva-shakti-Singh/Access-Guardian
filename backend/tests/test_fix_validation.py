import unittest

from backend.app.services.ai.fix import AIError, validate_replacement


class FixValidationTests(unittest.TestCase):
    def test_accepts_one_accessible_name_change(self):
        original = '<img src="photo.png" alt="Old">'
        replacement = '<img src="photo.png" alt="A mountain">'
        self.assertEqual(validate_replacement(original, replacement), replacement)

    def test_rejects_tag_child_or_attribute_changes(self):
        cases = [
            ('<button>Save</button>', '<a>Save</a>'),
            ('<button>Save</button>', '<button>Cancel</button>'),
            ('<button>Save</button>', '<button type="submit">Save</button>'),
            ('<button>Save</button>', '<button onclick="run()">Save</button>'),
        ]
        for original, replacement in cases:
            with self.subTest(replacement=replacement):
                with self.assertRaises(AIError):
                    validate_replacement(original, replacement)

    def test_rejects_removing_existing_accessible_name(self):
        with self.assertRaises(AIError):
            validate_replacement(
                '<img src="photo.png" alt="A mountain">',
                '<img src="photo.png">',
            )

    def test_rejects_script_and_extra_content(self):
        with self.assertRaises(AIError):
            validate_replacement(
                '<img src="photo.png">',
                '<img src="photo.png" alt="A photo"><script>alert(1)</script>',
            )
        with self.assertRaises(AIError):
            validate_replacement(
                '<script>alert(1)</script>',
                '<script>alert(1)</script>',
            )

    def test_rejects_empty_oversized_and_malformed_values(self):
        original = '<img src="photo.png">'
        for replacement in (
            "",
            '<img src="photo.png" alt="">',
            '<img src="photo.png" alt="' + ("x" * 151) + '">',
            '<img src="photo.png" alt="bad<script>"',
        ):
            with self.subTest(replacement=replacement):
                with self.assertRaises(AIError):
                    validate_replacement(original, replacement)


if __name__ == "__main__":
    unittest.main()

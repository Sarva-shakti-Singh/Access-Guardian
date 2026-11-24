import unittest

from backend.app.services.ai.fix import AIError, validate_replacement


class FixValidationTests(unittest.TestCase):
    def test_allows_accessible_name_attribute_change(self):
        original = '<button class="ok"><span>Save</span></button>'
        replacement = '<button class="ok" aria-label="Save item"><span>Save</span></button>'
        self.assertEqual(validate_replacement(original, replacement), replacement)

    def test_rejects_tag_and_children_changes(self):
        original = '<button class="ok"><span>Save</span></button>'
        with self.assertRaises(AIError):
            validate_replacement(original, '<a class="ok" aria-label="Save item"><span>Save</span></a>')
        with self.assertRaises(AIError):
            validate_replacement(original, '<button class="ok" aria-label="Save item"><b>Save</b></button>')

    def test_rejects_unrelated_attribute_changes(self):
        original = '<button class="ok"><span>Save</span></button>'
        with self.assertRaises(AIError):
            validate_replacement(original, '<button class="changed" aria-label="Save item"><span>Save</span></button>')


if __name__ == "__main__":
    unittest.main()

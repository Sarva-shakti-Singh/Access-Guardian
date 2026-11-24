"""Server-side constrained remediation proposal validation tests."""
import unittest

from backend.app.services.ai.fix import AIError, validate_replacement


class FixValidationTests(unittest.TestCase):
    def test_allows_accessible_name_attribute_change(self):
        original = '<button class="ok"><span>Save</span></button>'
        replacement = '<button class="ok" aria-label="Save item"><span>Save</span></button>'
        self.assertEqual(validate_replacement(original, replacement), replacement)

    def test_rejects_tag_children_and_extra_sibling_changes(self):
        original = '<button class="ok"><span>Save</span></button>'
        for replacement in (
            '<a class="ok" aria-label="Save item"><span>Save</span></a>',
            '<button class="ok" aria-label="Save item"><b>Save</b></button>',
            '<button class="ok" aria-label="Save item"><span>Save</span></button><script>x</script>',
        ):
            with self.subTest(replacement=replacement), self.assertRaises(AIError):
                validate_replacement(original, replacement)

    def test_rejects_unrelated_attribute_changes(self):
        with self.assertRaises(AIError):
            validate_replacement('<button class="ok"></button>', '<button class="changed" aria-label="Save"></button>')

    def test_rejects_incomplete_and_duplicate_root_markup(self):
        for original in ('<button>Save', '<button></button><button></button>'):
            with self.subTest(original=original), self.assertRaises(AIError):
                validate_replacement(original, '<button aria-label="Save">Save</button>')


if __name__ == "__main__":
    unittest.main()

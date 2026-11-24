import unittest
from unittest.mock import patch

import httpx

from backend.app.services.ai.provider import AIError, chat_json


class ProviderTests(unittest.TestCase):
    def _response(self, status, payload):
        request = httpx.Request("POST", "https://api.openai.com/v1/chat/completions")
        return httpx.Response(status, json=payload, request=request)

    @patch("backend.app.services.ai.provider.httpx.post")
    def test_valid_chat_completions_request(self, post):
        post.return_value = self._response(200, {
            "choices": [{"message": {"content": "{\"replacement\":\"<img alt=\\\"A\\\" src=\\\"x.png\\\">\"}"}}]
        })
        result = chat_json(
            "https://api.openai.com/v1",
            "gpt-5.4-mini",
            "test-key",
            [{"role": "user", "content": "test"}],
        )
        self.assertEqual(result["replacement"], '<img alt="A" src="x.png">')
        args, kwargs = post.call_args
        self.assertEqual(args[0], "https://api.openai.com/v1/chat/completions")
        self.assertEqual(kwargs["headers"]["Authorization"], "Bearer test-key")
        self.assertEqual(kwargs["json"]["model"], "gpt-5.4-mini")
        self.assertNotIn("/v1/v1/", args[0])

    @patch("backend.app.services.ai.provider.httpx.post")
    def test_authentication_failure_is_sanitized(self, post):
        post.return_value = self._response(401, {"error": {"message": "secret details"}})
        with self.assertRaisesRegex(AIError, "authentication failed"):
            chat_json("https://api.openai.com/v1", "gpt-5.4-mini", "bad-key", [])

    @patch("backend.app.services.ai.provider.httpx.post")
    def test_model_not_found_is_sanitized(self, post):
        post.return_value = self._response(404, {"error": {"message": "model unavailable"}})
        with self.assertRaisesRegex(AIError, "endpoint or model"):
            chat_json("https://api.openai.com/v1", "missing-model", "test-key", [])

    @patch("backend.app.services.ai.provider.httpx.post")
    def test_rate_limit_is_sanitized(self, post):
        post.return_value = self._response(429, {"error": {"message": "quota"}})
        with self.assertRaisesRegex(AIError, "rate limit or quota"):
            chat_json("https://api.openai.com/v1", "gpt-5.4-mini", "test-key", [])

    @patch("backend.app.services.ai.provider.httpx.post")
    def test_network_timeout(self, post):
        post.side_effect = httpx.TimeoutException("timeout")
        with self.assertRaisesRegex(AIError, "timed out"):
            chat_json("https://api.openai.com/v1", "gpt-5.4-mini", "test-key", [])

    @patch("backend.app.services.ai.provider.httpx.post")
    def test_invalid_json_response(self, post):
        request = httpx.Request("POST", "https://api.openai.com/v1/chat/completions")
        post.return_value = httpx.Response(200, text="not-json", request=request)
        with self.assertRaisesRegex(AIError, "invalid JSON"):
            chat_json("https://api.openai.com/v1", "gpt-5.4-mini", "test-key", [])

    @patch("backend.app.services.ai.provider.httpx.post")
    def test_bad_request_is_sanitized(self, post):
        post.return_value = self._response(400, {"error": {"message": "private provider detail"}})
        with self.assertRaisesRegex(AIError, "HTTP 400"):
            chat_json("https://api.openai.com/v1", "gpt-5.4-mini", "test-key", [])

    @patch("backend.app.services.ai.provider.httpx.post")
    def test_permission_denied_is_sanitized(self, post):
        post.return_value = self._response(403, {"error": {"message": "private provider detail"}})
        with self.assertRaisesRegex(AIError, "HTTP 403"):
            chat_json("https://api.openai.com/v1", "gpt-5.4-mini", "test-key", [])

    @patch("backend.app.services.ai.provider.httpx.post")
    def test_provider_outage_is_sanitized(self, post):
        post.return_value = self._response(503, {"error": {"message": "private provider detail"}})
        with self.assertRaisesRegex(AIError, "HTTP 503"):
            chat_json("https://api.openai.com/v1", "gpt-5.4-mini", "test-key", [])

    def test_missing_remote_api_key(self):
        with self.assertRaisesRegex(AIError, "ACCESS_GUARDIAN_AI_API_KEY"):
            chat_json("https://api.openai.com/v1", "gpt-5.4-mini", "", [])


if __name__ == "__main__":
    unittest.main()

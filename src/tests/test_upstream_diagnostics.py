"""Deployment regressions use mock responses and never call the provider."""

import asyncio
from contextlib import contextmanager
import unittest
from unittest.mock import AsyncMock, patch

import httpx
from fastapi.testclient import TestClient

from app import canonicalize, create_app, interpret_until_disconnect


API_KEY = "test-diagnostics-key-only"
PRIVATE_DETAIL = "private-provider-detail-do-not-log"
ANSWER = "可以结合现实情况稳步推进。"


def cast():
    return {"question": "接下来如何安排学习？",
            "lines": [{"coins": ["back", "front", "front"]} for _ in range(6)]}


def completion():
    return httpx.Response(200, json={"choices": [{"finish_reason": "stop",
                         "message": {"role": "assistant", "content": ANSWER}}]})


@contextmanager
def without_asyncio_timeout():
    """Emulate Python 3.10 while restoring the running interpreter afterward."""
    sentinel = object()
    original = vars(asyncio).pop("timeout", sentinel)
    try:
        yield
    finally:
        if original is not sentinel:
            asyncio.timeout = original


class StalledBody(httpx.AsyncByteStream):
    def __init__(self):
        self.cancelled = False
        self.closed = False

    async def __aiter__(self):
        try:
            await asyncio.sleep(10)
            yield b"{}"
        except asyncio.CancelledError:
            self.cancelled = True
            raise

    async def aclose(self):
        self.closed = True


class UpstreamDiagnosticsTests(unittest.TestCase):
    def assert_no_private_details(self, text):
        self.assertNotIn(API_KEY, text)
        self.assertNotIn(PRIVATE_DETAIL, text)

    def test_success_without_asyncio_timeout_cleans_up_disconnect_watcher(self):
        async def exercise():
            watcher_closed = asyncio.Event()

            class Request:
                async def receive(self):
                    try:
                        await asyncio.Event().wait()
                    finally:
                        watcher_closed.set()

            async def handler(_request):
                return completion()

            async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
                before = asyncio.all_tasks()
                with without_asyncio_timeout():
                    result = await interpret_until_disconnect(
                        Request(), client, API_KEY, canonicalize(cast()), 0.5, "测试提示词")
                self.assertEqual(result["interpretation"], ANSWER)
                self.assertTrue(watcher_closed.is_set())
                self.assertEqual(asyncio.all_tasks(), before)

        asyncio.run(exercise())

    def test_timeout_without_asyncio_timeout_returns_504_and_closes_upstream(self):
        stream = StalledBody()

        async def handler(_request):
            return httpx.Response(200, stream=stream)

        application = create_app(api_key=API_KEY, transport=httpx.MockTransport(handler),
                                 timeout_seconds=0.025)
        with TestClient(application) as client:
            with without_asyncio_timeout():
                response = client.post("/api/interpret", json=cast())
        self.assertEqual(response.status_code, 504, response.text)
        self.assertEqual(response.json()["error"]["code"], "UPSTREAM_TIMEOUT")
        self.assertTrue(stream.cancelled)
        self.assertTrue(stream.closed)
        self.assert_no_private_details(response.text)

    def test_legacy_asyncio_timeout_error_returns_504(self):
        class LegacyTimeoutError(Exception):
            pass

        async def handler(_request):
            return completion()

        application = create_app(api_key=API_KEY, transport=httpx.MockTransport(handler))
        with TestClient(application) as client:
            with patch("app.asyncio.TimeoutError", LegacyTimeoutError):
                with patch("app.interpret_until_disconnect", new_callable=AsyncMock,
                           side_effect=LegacyTimeoutError(f"{PRIVATE_DETAIL}: {API_KEY}")):
                    response = client.post("/api/interpret", json=cast())
        self.assertEqual(response.status_code, 504, response.text)
        self.assertEqual(response.json()["error"]["code"], "UPSTREAM_TIMEOUT")
        self.assert_no_private_details(response.text)

    def test_http_failure_logs_status_without_provider_body_or_credentials(self):
        async def handler(_request):
            return httpx.Response(401, text=f"{PRIVATE_DETAIL}: {API_KEY}",
                                  headers={"x-private-detail": PRIVATE_DETAIL})

        application = create_app(api_key=API_KEY, transport=httpx.MockTransport(handler))
        with TestClient(application) as client:
            with self.assertLogs("app", level="WARNING") as logs:
                response = client.post("/api/interpret", json=cast())
        self.assertEqual(response.status_code, 502, response.text)
        self.assertEqual(response.json()["error"]["code"], "UPSTREAM_UNAVAILABLE")
        self.assertIn("401", "\n".join(logs.output))
        self.assert_no_private_details("\n".join(logs.output) + response.text)
        self.assertTrue(all(record.exc_info is None for record in logs.records))

    def test_connection_failure_logs_class_without_exception_message_or_credentials(self):
        async def handler(_request):
            raise httpx.ConnectError(f"{PRIVATE_DETAIL}: {API_KEY}")

        application = create_app(api_key=API_KEY, transport=httpx.MockTransport(handler))
        with TestClient(application) as client:
            with self.assertLogs("app", level="WARNING") as logs:
                response = client.post("/api/interpret", json=cast())
        self.assertEqual(response.status_code, 502, response.text)
        self.assertEqual(response.json()["error"]["code"], "UPSTREAM_FAILED")
        self.assertIn("ConnectError", "\n".join(logs.output))
        self.assert_no_private_details("\n".join(logs.output) + response.text)
        self.assertTrue(all(record.exc_info is None for record in logs.records))


if __name__ == "__main__":
    unittest.main()

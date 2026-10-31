"""Prompt settings and draft debugging use temporary files and mocked HTTP only."""

import asyncio
from contextlib import contextmanager
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import httpx
from fastapi.testclient import TestClient

from app import create_app
from prompt_config import PromptStore


API_KEY = "prompt-tests-key-only-456"
PRIVATE_ERROR = "private-provider-diagnostic"
ORIGINAL_PROMPT = "  临时测试的原始提示词。\n请保留空格和换行。  "
ANSWER = "先明确问题，再核实可行动的信息。"


def completion(content=ANSWER, finish_reason="stop", role="assistant"):
    return httpx.Response(200, json={"choices": [{"finish_reason": finish_reason,
                           "message": {"role": role, "content": content}}]})


def cast(draft=None):
    # Six yang lines, with only the initial/bottom line moving: Qian -> Gou.
    payload = {"question": "  下一阶段如何安排学习？  ",
               "lines": [{"coins": ["back"] * 3}] + [
                   {"coins": ["front", "front", "back"]} for _ in range(5)]}
    if draft is not None:
        payload["systemPrompt"] = draft
    return payload


class PromptSettingsTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.prompt_path = Path(temporary.name) / "config" / "prompt.json"
        self.prompt_path.parent.mkdir()
        self.write_config(ORIGINAL_PROMPT)
        self.calls = []

    def write_config(self, value):
        self.prompt_path.write_text(json.dumps({"system_prompt": value}, ensure_ascii=False), encoding="utf-8")

    @contextmanager
    def client(self, handler=None, api_key=API_KEY, timeout_seconds=0.5):
        async def mock(request):
            self.calls.append(request)
            return completion() if handler is None else await handler(request)

        application = create_app(api_key=api_key, transport=httpx.MockTransport(mock),
                                 timeout_seconds=timeout_seconds, prompt_path=self.prompt_path)
        with TestClient(application) as client:
            yield client, application

    def safe_error(self, response, status, code=None):
        self.assertEqual(response.status_code, status, response.text)
        self.assertIn("application/json", response.headers.get("content-type", ""))
        body = response.json()
        self.assertIsInstance(body.get("error", {}).get("code"), str)
        self.assertIsInstance(body["error"].get("message"), str)
        if code:
            self.assertEqual(body["error"]["code"], code)
        for private in (API_KEY, PRIVATE_ERROR, str(self.prompt_path)):
            self.assertNotIn(private, response.text)
        self.assert_security_headers(response)
        return body

    def assert_security_headers(self, response):
        self.assertEqual(response.headers.get("x-content-type-options"), "nosniff")
        self.assertEqual(response.headers.get("referrer-policy"), "no-referrer")
        self.assertIn("default-src 'self'", response.headers.get("content-security-policy", ""))
        self.assertIn("frame-ancestors 'none'", response.headers.get("content-security-policy", ""))

    def system_prompt_sent(self, index=-1):
        payload = json.loads(self.calls[index].content)
        self.assertEqual(payload["messages"][0]["role"], "system")
        return payload["messages"][0]["content"]

    def test_get_and_head_preserve_exact_prompt_and_never_contact_upstream(self):
        with self.client() as (client, _application):
            response = client.get("/api/settings/prompt")
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.json(), {"systemPrompt": ORIGINAL_PROMPT, "maxLength": 20000})
            self.assertEqual(response.headers.get("cache-control"), "no-store")
            self.assert_security_headers(response)
            head = client.head("/api/settings/prompt")
            self.assertEqual(head.status_code, 200)
            self.assertEqual(head.content, b"")
            self.assertEqual(head.headers["content-length"], response.headers["content-length"])
            self.assertNotIn(API_KEY, response.text)
        self.assertEqual(self.calls, [])

    def test_put_persists_spaces_newlines_and_survives_a_new_app(self):
        updated = "\n  新提示词：保留前后空白。\n第二行。\n  "
        with self.client() as (client, _application):
            response = client.put("/api/settings/prompt", json={"systemPrompt": updated})
            self.assertEqual(response.status_code, 200, response.text)
            self.assert_security_headers(response)
            self.assertEqual(json.loads(self.prompt_path.read_text(encoding="utf-8")), {"system_prompt": updated})
            self.assertEqual(client.get("/api/settings/prompt").json()["systemPrompt"], updated)
        with self.client() as (client, _application):
            self.assertEqual(client.get("/api/settings/prompt").json()["systemPrompt"], updated)
            self.assertEqual(client.post("/api/interpret", json=cast()).status_code, 200)
            self.assertEqual(self.system_prompt_sent(), updated)

    def test_next_interpretation_uses_saved_prompt_without_restart(self):
        with self.client() as (client, _application):
            self.assertEqual(client.post("/api/interpret", json=cast()).status_code, 200)
            self.assertEqual(self.system_prompt_sent(), ORIGINAL_PROMPT)
            updated = "新的立即生效提示词。"
            self.assertEqual(client.put("/api/settings/prompt", json={"systemPrompt": updated}).status_code, 200)
            self.assertEqual(client.post("/api/interpret", json=cast()).status_code, 200)
            self.assertEqual(self.system_prompt_sent(), updated)
        self.assertEqual(len(self.calls), 2)

    def test_external_config_edits_are_read_by_each_request(self):
        with self.client() as (client, _application):
            self.assertEqual(client.get("/api/settings/prompt").json()["systemPrompt"], ORIGINAL_PROMPT)
            external = "外部编辑器保存的提示词。\n不需要重启。"
            self.write_config(external)
            self.assertEqual(client.get("/api/settings/prompt").json()["systemPrompt"], external)
            self.assertEqual(client.post("/api/interpret", json=cast()).status_code, 200)
            self.assertEqual(self.system_prompt_sent(), external)

    def test_debug_uses_unsaved_draft_and_recomputes_trusted_coins(self):
        before = self.prompt_path.read_bytes()
        draft = "  尚未保存的调试提示词。\n原样传给模型。  "
        payload = cast(draft)
        payload.update(primary={"name": "FORGED"}, movingLines=[99])
        for line in payload["lines"]:
            line.update(yang=False, moving="FORGED", name="FORGED")
        with self.client() as (client, _application):
            response = client.post("/api/debug/interpret", json=payload)
            self.assertEqual(response.status_code, 200, response.text)
            result = response.json()
            self.assertEqual(result["model"], "deepseek-flash")
            self.assertEqual(result["interpretation"], ANSWER)
            self.assertEqual(result["hexagram"]["primary"]["number"], 1)
            self.assertEqual(result["hexagram"]["changed"]["number"], 44)
            self.assertEqual(result["hexagram"]["movingLines"], [1])
            upstream = json.loads(self.calls[-1].content)
            self.assertEqual(str(self.calls[-1].url), "https://api.deepseek.com/chat/completions")
            self.assertEqual(self.calls[-1].headers["authorization"], f"Bearer {API_KEY}")
            self.assertEqual(upstream["model"], "deepseek-flash")
            self.assertIs(upstream["stream"], False)
            self.assertEqual(upstream["thinking"], {"type": "disabled"})
            self.assertEqual(upstream["max_tokens"], 2200)
            self.assertEqual(self.system_prompt_sent(), draft)
            data = json.loads(upstream["messages"][1]["content"])
            self.assertEqual(data["question"], payload["question"].strip())
            self.assertNotIn("systemPrompt", data)
            self.assertNotIn("FORGED", json.dumps(data))
            self.assertEqual([line["moving"] for line in data["lines"]], [True] + [False] * 5)
            self.assertEqual(self.prompt_path.read_bytes(), before)
            self.assertEqual(client.get("/api/settings/prompt").json()["systemPrompt"], ORIGINAL_PROMPT)
            self.assertEqual(client.post("/api/interpret", json=cast()).status_code, 200)
            self.assertEqual(self.system_prompt_sent(), ORIGINAL_PROMPT)

    def test_invalid_prompts_do_not_save_or_call_upstream(self):
        invalid = (None, True, 4, [], {}, "", " \n\t ", "字" * 20001, "😀" * 10001, "\ud800")
        before = self.prompt_path.read_bytes()
        with self.client() as (client, _application):
            for value in invalid:
                with self.subTest(value_type=type(value).__name__, length=len(value) if isinstance(value, str) else None):
                    self.safe_error(client.put("/api/settings/prompt", json={"systemPrompt": value}), 400, "INVALID_PROMPT")
                    self.safe_error(client.post("/api/debug/interpret", json={**cast(), "systemPrompt": value}), 400, "INVALID_PROMPT")
            for body in (None, [], {}, {"prompt": "wrong key"}):
                self.safe_error(client.put("/api/settings/prompt", content=json.dumps(body),
                                          headers={"content-type": "application/json"}), 400, "INVALID_PROMPT")
            self.safe_error(client.post("/api/debug/interpret", json=cast()), 400, "INVALID_PROMPT")
        self.assertEqual(self.prompt_path.read_bytes(), before)
        self.assertEqual(self.calls, [])

    def test_full_utf16_prompt_boundary_is_accepted_in_settings_and_debug(self):
        with self.client() as (client, _application):
            for prompt in ("字" * 20000, "😀" * 10000):
                with self.subTest(chars=len(prompt)):
                    response = client.put("/api/settings/prompt", json={"systemPrompt": prompt})
                    self.assertEqual(response.status_code, 200, response.text)
                    self.assertEqual(client.get("/api/settings/prompt").json()["systemPrompt"], prompt)
                    response = client.post("/api/debug/interpret", json=cast(prompt))
                    self.assertEqual(response.status_code, 200, response.text)
                    self.assertEqual(self.system_prompt_sent(), prompt)

    def test_settings_and_debug_use_128_kib_while_interpret_stays_32_kib(self):
        with self.client() as (client, _application):
            oversized = "x" * (129 * 1024)
            self.safe_error(client.put("/api/settings/prompt", json={"systemPrompt": "合法提示词", "padding": oversized}), 413)
            self.safe_error(client.post("/api/debug/interpret", json={**cast("合法草稿"), "padding": oversized}), 413)
            self.safe_error(client.post("/api/interpret", json={**cast(), "padding": "x" * (33 * 1024)}), 413)
            for method, path, payload in (("PUT", "/api/settings/prompt", {"systemPrompt": "合法提示词"}),
                                          ("POST", "/api/debug/interpret", cast("合法草稿"))):
                raw = json.dumps({**payload, "padding": oversized}).encode()
                request = client.build_request(method, path, headers={"content-type": "application/json"},
                                               content=(raw[i:i + 8192] for i in range(0, len(raw), 8192)))
                self.assertNotIn("content-length", request.headers)
                self.safe_error(client.send(request), 413)
        self.assertEqual(self.calls, [])
        self.assertEqual(PromptStore(self.prompt_path).read(), ORIGINAL_PROMPT)

    def test_corrupt_config_returns_safe_503_without_fallback(self):
        corrupt = (b"not-json", b"\xff", b"[]", b"{}", b'{"system_prompt": false}',
                   json.dumps({"system_prompt": "  \n "}).encode(),
                   json.dumps({"system_prompt": "x" * 20001}).encode(),
                   ("[" * 2000 + "0" + "]" * 2000).encode())
        with self.client() as (client, _application):
            for raw in corrupt:
                with self.subTest(size=len(raw)):
                    self.prompt_path.write_bytes(raw)
                    self.safe_error(client.get("/api/settings/prompt"), 503, "PROMPT_CONFIG_UNAVAILABLE")
                    self.safe_error(client.post("/api/interpret", json=cast()), 503, "PROMPT_CONFIG_UNAVAILABLE")
        self.assertEqual(self.calls, [])

    def test_missing_config_can_be_explicitly_created_and_debug_is_independent(self):
        with self.client() as (client, _application):
            self.prompt_path.unlink()
            self.safe_error(client.get("/api/settings/prompt"), 503, "PROMPT_CONFIG_UNAVAILABLE")
            self.safe_error(client.post("/api/interpret", json=cast()), 503, "PROMPT_CONFIG_UNAVAILABLE")
            self.assertFalse(self.prompt_path.exists(), "reads must not silently create a fallback")
            self.assertEqual(client.post("/api/debug/interpret", json=cast("独立草稿")).status_code, 200)
            self.assertFalse(self.prompt_path.exists(), "debug must not create or save the config")
            self.assertEqual(client.put("/api/settings/prompt", json={"systemPrompt": "明确保存的新配置"}).status_code, 200)
            self.assertEqual(PromptStore(self.prompt_path).read(), "明确保存的新配置")

    def test_failed_atomic_replace_preserves_previous_file_and_cleans_temporary_file(self):
        before = self.prompt_path.read_bytes()
        with self.client() as (client, _application):
            with patch("prompt_config.os.replace", side_effect=OSError(PRIVATE_ERROR)):
                self.safe_error(client.put("/api/settings/prompt", json={"systemPrompt": "不能写入的更新"}), 503, "PROMPT_CONFIG_UNAVAILABLE")
            self.assertEqual(self.prompt_path.read_bytes(), before)
            self.assertEqual(list(self.prompt_path.parent.glob(".prompt-*.tmp")), [])
            self.assertEqual(client.post("/api/interpret", json=cast()).status_code, 200)
            self.assertEqual(self.system_prompt_sent(), ORIGINAL_PROMPT)

    def test_method_media_and_json_errors_are_safe(self):
        with self.client() as (client, _application):
            for method, path in (("POST", "/api/settings/prompt"), ("DELETE", "/api/settings/prompt"),
                                 ("PATCH", "/api/settings/prompt"), ("GET", "/api/debug/interpret"),
                                 ("PUT", "/api/debug/interpret")):
                self.safe_error(client.request(method, path), 405)
            for method, path in (("PUT", "/api/settings/prompt"), ("POST", "/api/debug/interpret")):
                self.safe_error(client.request(method, path, content="{}", headers={"content-type": "text/plain"}), 415)
                for raw in (b'{"systemPrompt":', b"\xff", ("[" * 2000 + "0" + "]" * 2000).encode()):
                    self.safe_error(client.request(method, path, content=raw, headers={"content-type": "application/json"}), 400)
        self.assertEqual(self.calls, [])

    def test_debug_retains_question_and_coin_validation(self):
        invalid = ({**cast("草稿"), "question": " "}, {**cast("草稿"), "lines": []},
                   {**cast("草稿"), "lines": [{"coins": [True, "front", "back"]}] * 6})
        with self.client() as (client, _application):
            for payload in invalid:
                self.safe_error(client.post("/api/debug/interpret", json=payload), 400)
        self.assertEqual(self.calls, [])

    def test_settings_work_without_api_key_but_debug_requires_it(self):
        with self.client(api_key="") as (client, _application):
            self.assertEqual(client.get("/api/settings/prompt").status_code, 200)
            self.assertEqual(client.put("/api/settings/prompt", json={"systemPrompt": "没有密钥也可保存"}).status_code, 200)
            self.safe_error(client.post("/api/debug/interpret", json=cast("调试草稿")), 503)
        self.assertEqual(self.calls, [])

    def test_debug_retains_safe_upstream_failure_and_secret_protections(self):
        async def unauthorized(_request):
            return httpx.Response(401, text=f"{PRIVATE_ERROR} {API_KEY}")

        async def redirect(_request):
            return httpx.Response(307, headers={"location": "https://example.invalid"})

        async def network_failure(_request):
            raise httpx.ConnectError(f"{PRIVATE_ERROR} {API_KEY}")

        async def key_echo(_request):
            return completion(API_KEY)

        async def truncated(_request):
            return completion(finish_reason="length")

        async def nonassistant(_request):
            return completion(role="user")

        for handler in (unauthorized, redirect, network_failure, key_echo, truncated, nonassistant):
            with self.subTest(case=handler.__name__), self.client(handler) as (client, _application):
                previous = len(self.calls)
                self.safe_error(client.post("/api/debug/interpret", json=cast("调试草稿")), 502)
                self.assertEqual(len(self.calls), previous + 1)
        self.assertEqual(PromptStore(self.prompt_path).read(), ORIGINAL_PROMPT)

    def test_debug_timeout_cancels_upstream_without_saving_draft(self):
        cancelled = []

        async def stalled(_request):
            try:
                await asyncio.sleep(10)
            except asyncio.CancelledError:
                cancelled.append(True)
                raise
            return completion()

        with self.client(stalled, timeout_seconds=0.025) as (client, _application):
            self.safe_error(client.post("/api/debug/interpret", json=cast("超时不落盘草稿")), 504)
        self.assertEqual(cancelled, [True])
        self.assertEqual(PromptStore(self.prompt_path).read(), ORIGINAL_PROMPT)

    def test_debug_browser_disconnect_cancels_upstream_without_saving_draft(self):
        async def exercise():
            started = asyncio.Event()
            cancelled = []

            async def handler(_request):
                started.set()
                try:
                    await asyncio.sleep(10)
                except asyncio.CancelledError:
                    cancelled.append(True)
                    raise
                return completion()

            application = create_app(api_key=API_KEY, transport=httpx.MockTransport(handler),
                                     timeout_seconds=2, prompt_path=self.prompt_path)
            messages = asyncio.Queue()
            body = json.dumps(cast("取消后不能保存的草稿")).encode()
            await messages.put({"type": "http.request", "body": body, "more_body": False})
            sent = []

            async def send(message):
                sent.append(message)

            scope = {"type": "http", "asgi": {"version": "3.0", "spec_version": "2.3"},
                     "http_version": "1.1", "method": "POST", "scheme": "http", "root_path": "",
                     "path": "/api/debug/interpret", "raw_path": b"/api/debug/interpret", "query_string": b"",
                     "headers": [(b"content-type", b"application/json"),
                                 (b"content-length", str(len(body)).encode())],
                     "client": ("127.0.0.1", 12345), "server": ("127.0.0.1", 3000)}
            async with application.router.lifespan_context(application):
                task = asyncio.create_task(application(scope, messages.get, send))
                try:
                    await asyncio.wait_for(started.wait(), 1)
                    await messages.put({"type": "http.disconnect"})
                    await asyncio.wait_for(task, 1)
                finally:
                    if not task.done():
                        task.cancel()
                    await asyncio.gather(task, return_exceptions=True)
            self.assertEqual(cancelled, [True])
            self.assertEqual([item["status"] for item in sent if item["type"] == "http.response.start"], [499])
            raw = b"".join(item.get("body", b"") for item in sent if item["type"] == "http.response.body")
            self.assertNotIn(API_KEY.encode(), raw)
            self.assertNotIn(PRIVATE_ERROR.encode(), raw)

        asyncio.run(exercise())
        self.assertEqual(PromptStore(self.prompt_path).read(), ORIGINAL_PROMPT)

    def test_prompt_page_assets_are_public_but_configuration_is_not(self):
        with self.client() as (client, _application):
            for path, media_type in (("/prompt.html", "text/html"), ("/css/prompt.css", "text/css"), ("/js/prompt.js", "javascript")):
                with self.subTest(path=path):
                    response = client.get(path)
                    self.assertEqual(response.status_code, 200, response.text)
                    self.assertIn(media_type, response.headers.get("content-type", ""))
                    self.assertTrue(response.content)
                    self.assert_security_headers(response)
                    self.assertEqual(client.head(path).content, b"")
                    self.assertNotIn(API_KEY, response.text)
            for path in ("/config/prompt.json", "/config%2fprompt.json", "/prompt_config.py", "/config/../config/prompt.json"):
                self.safe_error(client.get(path), 404)


if __name__ == "__main__":
    unittest.main()

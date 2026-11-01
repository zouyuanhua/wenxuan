"""Local FastAPI service; credentials and model requests stay on this server."""

import asyncio
from contextlib import asynccontextmanager
import json
import logging
import math
import os
from pathlib import Path

import httpx
from dotenv import load_dotenv
from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from starlette.exceptions import HTTPException
from starlette.requests import ClientDisconnect
from starlette.responses import JSONResponse, Response

from hexagram import change_lines, classify_coins, describe_hexagram
from followup import FollowupError, validate_followup
from gua_classics import classics_grounding, classics_summary
from guard import (DEFAULT_GUARD_PROMPT, GuardError, fallback_guard,
                   normalize_guard_result, parse_guard_result, validate_guard_payload)
from prompt_config import MAX_PROMPT_LENGTH, PromptConfigError, PromptStore, validate_prompt

APP_DIR = Path(__file__).resolve().parent
logger = logging.getLogger(__name__)
MODEL = "deepseek-flash"
UPSTREAM_URL = "https://api.deepseek.com/chat/completions"
MAX_REQUEST_BYTES = 32 * 1024
MAX_SETTINGS_BYTES = 128 * 1024
MAX_RESPONSE_BYTES = 256 * 1024
GUARD_MAX_TOKENS = 600
GUARD_TIMEOUT_SECONDS = 20
FOLLOWUP_MAX_TOKENS = 1600
POSITIONS = ("初爻", "二爻", "三爻", "四爻", "五爻", "上爻")
COMBINATIONS = ("三个字", "两字一背", "两背一字", "三个背")
STATIC_FILES = {
    b"/": ("index.html", "text/html; charset=utf-8"),
    b"/index.html": ("index.html", "text/html; charset=utf-8"),
    b"/css/style.css": ("css/style.css", "text/css; charset=utf-8"),
    b"/css/paipan.css": ("css/paipan.css", "text/css; charset=utf-8"),
    b"/css/reading.css": ("css/reading.css", "text/css; charset=utf-8"),
    b"/js/app.js": ("js/app.js", "text/javascript; charset=utf-8"),
    b"/js/hexagram.js": ("js/hexagram.js", "text/javascript; charset=utf-8"),
    b"/js/ask-data.js": ("js/ask-data.js", "text/javascript; charset=utf-8"),
    b"/js/vendor/lunar.min.js": ("js/vendor/lunar.min.js", "text/javascript; charset=utf-8"),
    b"/js/liuyao.js": ("js/liuyao.js", "text/javascript; charset=utf-8"),
    b"/js/paipan.js": ("js/paipan.js", "text/javascript; charset=utf-8"),
    b"/prompt.html": ("prompt.html", "text/html; charset=utf-8"),
    b"/css/prompt.css": ("css/prompt.css", "text/css; charset=utf-8"),
    b"/js/prompt.js": ("js/prompt.js", "text/javascript; charset=utf-8"),
    b"/assets/ritual.jpg": ("assets/ritual.jpg", "image/jpeg"),
}
SECURITY_HEADERS = {
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    "Content-Security-Policy": "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
}

def load_local_env():
    """An existing process variable always takes precedence over .env."""
    load_dotenv(APP_DIR / ".env", override=False)


class APIError(Exception):
    def __init__(self, status, code, message, headers=None):
        super().__init__(message)
        self.status = status
        self.code = code
        self.message = message
        self.headers = headers or {}


def error_response(error):
    headers = {"Cache-Control": "no-store", **error.headers}
    if error.status == 413:
        headers["Connection"] = "close"
    return JSONResponse({"error": {"code": error.code, "message": error.message}},
                        status_code=error.status, headers=headers)


class SecurityHeadersMiddleware:
    """Pure ASGI middleware preserves request disconnect/cancellation messages."""
    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            return await self.app(scope, receive, send)

        async def secured_send(message):
            if message["type"] == "http.response.start":
                headers = dict(message.get("headers", []))
                for name, value in SECURITY_HEADERS.items():
                    headers[name.lower().encode("ascii")] = value.encode("ascii")
                headers.setdefault(b"cache-control", b"no-store")
                message = {**message, "headers": list(headers.items())}
            await send(message)

        await self.app(scope, receive, secured_send)


def _reject_constant(_value):
    raise ValueError("Non-standard JSON constant")


async def read_request_json(request, max_bytes=MAX_REQUEST_BYTES):
    media_type = request.headers.get("content-type", "").split(";", 1)[0].strip().lower()
    if media_type != "application/json":
        raise APIError(415, "JSON_REQUIRED", "请使用 JSON 格式提交请求。")
    declared = request.headers.get("content-length")
    if declared is not None:
        try:
            length = int(declared)
        except ValueError:
            raise APIError(400, "INVALID_REQUEST", "请求内容无法读取，请重新提交。") from None
        if length < 0:
            raise APIError(400, "INVALID_REQUEST", "请求内容无法读取，请重新提交。")
        if length > max_bytes:
            raise APIError(413, "REQUEST_TOO_LARGE", "提交内容过大，请缩短内容后重试。")
    data = bytearray()
    try:
        async for chunk in request.stream():
            if len(data) + len(chunk) > max_bytes:
                raise APIError(413, "REQUEST_TOO_LARGE", "提交内容过大，请缩短内容后重试。")
            data.extend(chunk)
    except ClientDisconnect:
        raise APIError(400, "REQUEST_INTERRUPTED", "请求已中断，请重试。") from None
    try:
        return json.loads(data.decode("utf-8-sig"), parse_constant=_reject_constant)
    except (ValueError, UnicodeError, RecursionError):
        raise APIError(400, "INVALID_JSON", "请求内容无法读取，请重新提交。") from None


def canonicalize(body):
    if not isinstance(body, dict) or type(body.get("question")) is not str:
        raise APIError(400, "INVALID_QUESTION", "请输入1至2000字的问题。")
    question = body["question"].strip()
    # Keep the browser/previous server's UTF-16 character-count boundary.
    if not question or len(question.encode("utf-16-le", "surrogatepass")) // 2 > 2000:
        raise APIError(400, "INVALID_QUESTION", "请输入1至2000字的问题。")
    try:
        question.encode("utf-8")
    except UnicodeError:
        raise APIError(400, "INVALID_QUESTION", "问题中含有无法读取的字符，请重新输入。") from None
    if not isinstance(body.get("lines"), list) or len(body["lines"]) != 6:
        raise APIError(400, "INCOMPLETE_CAST", "请完成六次摇卦后再解卦。")
    lines = []
    for item in body["lines"]:
        if not isinstance(item, dict):
            raise APIError(400, "INVALID_COINS", "每爻必须包含三枚有效铜钱。")
        try:
            lines.append(classify_coins(item.get("coins")))
        except ValueError:
            raise APIError(400, "INVALID_COINS", "每爻必须包含三枚有效铜钱。") from None
    try:
        followup = validate_followup(body.get("followup"))
    except FollowupError as error:
        raise APIError(400, "INVALID_FOLLOWUP", str(error)) from None
    # 守门整理后的问题:仅用于组装给模型的问事内容,界面仍显示原文。
    # 非法或缺省时忽略,不阻断解卦。
    clean_question = body.get("cleanQuestion")
    if type(clean_question) is str:
        clean_question = clean_question.strip()
        if (not clean_question
                or len(clean_question.encode("utf-16-le", "surrogatepass")) // 2 > 2000):
            clean_question = None
    else:
        clean_question = None
    return {
        "question": question,
        "cleanQuestion": clean_question,
        "primary": describe_hexagram(lines),
        "changed": describe_hexagram(change_lines(lines)),
        "movingLines": [index + 1 for index, line in enumerate(lines) if line["moving"]],
        "lines": [{"position": index + 1, "positionName": POSITIONS[index],
                   "coins": line["coins"], "combination": COMBINATIONS[line["backCount"]],
                   "name": line["name"], "yang": line["yang"], "moving": line["moving"]}
                  for index, line in enumerate(lines)],
        "followup": followup,
    }


async def interpret(client, api_key, data, system_prompt):
    # FR-03 知识检索层：注入权威卦辞爻辞（64卦数据库），模型只允许依据原文解读（防幻觉）。
    grounding = classics_grounding(data)
    system_content = f"{system_prompt}\n\n{grounding}" if grounding else system_prompt
    # 守门整理后的问题只用于模型输入;没有整理版时沿用原文。
    clean_question = data.pop("cleanQuestion", None)
    if clean_question:
        data["question"] = clean_question
    # 把所问之事单独置顶,避免模型在长 JSON 里忽略问题、转入泛泛的人生解读。
    asked = data.get("question") or ""
    user_content = ((f"【所问之事】{asked}\n\n" if asked else "")
                    + "以下是本次卦象数据（question 字段即上句所问，勿改变其意图）：\n"
                    + json.dumps(data, ensure_ascii=False))
    messages = [{"role": "system", "content": system_content},
                {"role": "user", "content": user_content}]
    followup = data.get("followup")
    max_tokens = 2200
    if followup:
        # FR-05:同一卦象、同一问题的持续研讨;首次解读与历次问答一起入上下文。
        system_content += ("\n\n你正在与来问者围绕同一卦象、同一问题持续研讨，这是第"
                           f"{followup['index']}次追问（最多 3 次）。追问的回答要简短、清晰、"
                           "洞察人心、直指本质：先用一两句话直接给出判断，说清这件事的本质，"
                           "不铺垫、不复述问题、不写「这一问很关键」之类的过渡；"
                           "再用一两句点出卦象或前文哪里支持这个判断，不重做卦象解析，"
                           "不罗列纳甲、六亲、六神；最后落到一句：一个眼下可做的动作，"
                           "或一句让他自己带回心里的话，点到为止。全文 150 至 350 字，"
                           "用自然段落，不用标题，不用列表，不用 Markdown。"
                           "沿用前文已经作出的判断；若前文说错了，先用一句话明确修正，"
                           "再给新判断，不辩解。不要重新起卦，不要改写卦象与排盘事实，"
                           "不要重复前文已经说过的内容。若追问超出卦象所能回答的范围，"
                           "用一句话说明，并引导他回到本卦的问题上。"
                           "追问同样只围绕所问之事与原问题作答，不得转移到其他话题，"
                           "也不得泛化为人生建议。")
        messages[0] = {"role": "system", "content": system_content}
        initial = followup.get("initial")
        if initial:
            messages.append({"role": "assistant", "content": initial["answer"]})
        for item in followup["history"]:
            messages.append({"role": "user", "content": f"【追问{item['index']}】{item['question']}"})
            messages.append({"role": "assistant", "content": item["answer"]})
        messages.append({"role": "user", "content": f"【本次追问 · 第{followup['index']}次】{followup['question']}"})
        max_tokens = FOLLOWUP_MAX_TOKENS
    payload = {
        "model": MODEL,
        "messages": messages,
        "thinking": {"type": "disabled"}, "stream": False, "max_tokens": max_tokens,
    }
    async with client.stream("POST", UPSTREAM_URL, json=payload,
                             headers={"Authorization": f"Bearer {api_key}"}) as response:
        if response.status_code != 200:
            logger.warning("DeepSeek request rejected: status=%d", response.status_code)
            message = ("解卦服务繁忙，请稍后重试。" if response.status_code == 429
                       else "解卦服务暂不可用，请稍后重试。")
            raise APIError(502, "UPSTREAM_UNAVAILABLE", message)
        declared = response.headers.get("content-length")
        if declared is not None:
            try:
                too_large = int(declared) > MAX_RESPONSE_BYTES
            except ValueError:
                too_large = True
            if too_large:
                raise APIError(502, "INVALID_UPSTREAM", "解卦服务返回内容异常，请重试。")
        raw = bytearray()
        async for chunk in response.aiter_bytes():
            if len(raw) + len(chunk) > MAX_RESPONSE_BYTES:
                raise APIError(502, "INVALID_UPSTREAM", "解卦服务返回内容异常，请重试。")
            raw.extend(chunk)
        try:
            body = json.loads(raw.decode("utf-8-sig"), parse_constant=_reject_constant)
        except (ValueError, UnicodeError, RecursionError):
            raise APIError(502, "INVALID_UPSTREAM", "解卦服务返回内容异常，请重试。") from None
    choices = body.get("choices") if isinstance(body, dict) else None
    choice = choices[0] if isinstance(choices, list) and choices else None
    if not isinstance(choice, dict) or choice.get("finish_reason") != "stop":
        raise APIError(502, "INCOMPLETE_INTERPRETATION", "本次解卦内容未完整生成，请重试。")
    message = choice.get("message")
    content = message.get("content") if isinstance(message, dict) else None
    if (not isinstance(message, dict) or message.get("role") != "assistant"
            or type(content) is not str or not content.strip()
            or len(content) > 20000 or api_key in content):
        raise APIError(502, "INVALID_INTERPRETATION", "解卦服务返回内容异常，请重试。")
    return {"interpretation": content.strip(), "model": MODEL,
            "hexagram": {name: data[name] for name in ("primary", "changed", "movingLines")},
            "classics": classics_summary(data)}


async def guard_question(client, api_key, payload, prompt):
    """独立守门调用;未配置、超时或返回异常时一律退回本地规则。"""
    question = payload["question"]
    if not api_key.strip():
        return fallback_guard(question)
    messages = [{"role": "system", "content": prompt},
                {"role": "user", "content": json.dumps(payload, ensure_ascii=False)}]
    request_payload = {
        "model": MODEL, "messages": messages,
        "thinking": {"type": "disabled"}, "stream": False, "max_tokens": GUARD_MAX_TOKENS,
    }
    try:
        async with client.stream("POST", UPSTREAM_URL, json=request_payload,
                                 headers={"Authorization": f"Bearer {api_key}"}) as response:
            if response.status_code != 200:
                return fallback_guard(question)
            raw = bytearray()
            async for chunk in response.aiter_bytes():
                if len(raw) + len(chunk) > MAX_RESPONSE_BYTES:
                    return fallback_guard(question)
                raw.extend(chunk)
        body = json.loads(raw.decode("utf-8-sig"), parse_constant=_reject_constant)
    except (httpx.HTTPError, ValueError, UnicodeError, RecursionError):
        return fallback_guard(question)
    choices = body.get("choices") if isinstance(body, dict) else None
    choice = choices[0] if isinstance(choices, list) and choices else None
    message = choice.get("message") if isinstance(choice, dict) else None
    content = message.get("content") if isinstance(message, dict) else None
    normalized = normalize_guard_result(parse_guard_result(content), question)
    return normalized if normalized is not None else fallback_guard(question)


async def interpret_until_disconnect(request, client, api_key, data, timeout_seconds, system_prompt):
    async def disconnected():
        while True:
            if (await request.receive())["type"] == "http.disconnect":
                return
            await asyncio.sleep(0)

    work = asyncio.create_task(interpret(client, api_key, data, system_prompt))
    watch = asyncio.create_task(disconnected())
    try:
        # wait_for supports Python 3.10 and covers the entire response body.
        done, _ = await asyncio.wait_for(
            asyncio.wait((work, watch), return_when=asyncio.FIRST_COMPLETED),
            timeout=timeout_seconds,
        )
        if watch in done:
            raise APIError(499, "CLIENT_DISCONNECTED", "请求已中断，请重试。")
        return await work
    finally:
        for task in (work, watch):
            if not task.done():
                task.cancel()
        await asyncio.gather(work, watch, return_exceptions=True)


def create_app(api_key=None, transport=None, timeout_seconds=60, prompt_path=None):
    if (type(timeout_seconds) not in (int, float) or not math.isfinite(timeout_seconds)
            or timeout_seconds <= 0):
        raise ValueError("服务器超时配置无效。")
    key = os.environ.get("API_KEY_DS", "") if api_key is None else api_key
    if type(key) is not str:
        raise ValueError("服务器认证配置无效。")
    key = key.strip()
    configured = bool(key) and "\r" not in key and "\n" not in key
    prompt_store = PromptStore(prompt_path if prompt_path is not None else APP_DIR / "config" / "prompt.json")
    prompt_lock = asyncio.Lock()

    # Shared resources are created and closed by FastAPI's lifespan.
    # https://fastapi.tiangolo.com/advanced/events/
    @asynccontextmanager
    async def lifespan(application):
        async with httpx.AsyncClient(transport=transport, timeout=timeout_seconds,
                                     follow_redirects=False, verify=True) as client:
            application.state.client = client
            yield

    application = FastAPI(title="问玄", lifespan=lifespan, docs_url=None, redoc_url=None, openapi_url=None)
    application.router.redirect_slashes = False
    application.add_middleware(SecurityHeadersMiddleware)

    @application.exception_handler(HTTPException)
    async def http_error(_request, error):
        status = 404 if error.status_code == 404 else 405 if error.status_code == 405 else 400
        message = "未找到所请求的内容。" if status == 404 else "请求方式不受支持。"
        return error_response(APIError(status, "NOT_FOUND" if status == 404 else "INVALID_REQUEST", message))

    @application.exception_handler(RequestValidationError)
    async def validation_error(_request, _error):
        return error_response(APIError(400, "INVALID_REQUEST", "请求内容无法读取，请重新提交。"))

    @application.api_route("/{path:path}", methods=["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "TRACE", "CONNECT"])
    async def dispatch(request: Request, path: str):
        try:
            # Do not decode or normalize user paths into a filesystem path.
            raw_path = request.scope.get("raw_path", request.scope["path"].encode("utf-8")).split(b"?", 1)[0]
            if raw_path == b"/api/health":
                if request.method not in ("GET", "HEAD"):
                    raise APIError(405, "METHOD_NOT_ALLOWED", "服务状态仅支持读取。", {"Allow": "GET, HEAD"})
                response = JSONResponse({"ok": True, "configured": configured, "model": MODEL})
                return Response(headers=dict(response.headers)) if request.method == "HEAD" else response
            if raw_path == b"/api/settings/prompt":
                if request.method in ("GET", "HEAD"):
                    prompt = await asyncio.to_thread(prompt_store.read)
                    response = JSONResponse({"systemPrompt": prompt, "maxLength": MAX_PROMPT_LENGTH})
                    return Response(headers=dict(response.headers)) if request.method == "HEAD" else response
                if request.method != "PUT":
                    raise APIError(405, "METHOD_NOT_ALLOWED", "提示词配置支持读取和保存。", {"Allow": "GET, HEAD, PUT"})
                body = await read_request_json(request, MAX_SETTINGS_BYTES)
                try:
                    prompt = validate_prompt(body.get("systemPrompt") if isinstance(body, dict) else None)
                except ValueError as error:
                    raise APIError(400, "INVALID_PROMPT", str(error)) from None
                async with prompt_lock:
                    await asyncio.to_thread(prompt_store.write, prompt)
                return JSONResponse({"systemPrompt": prompt, "maxLength": MAX_PROMPT_LENGTH})
            if raw_path == b"/api/settings/guard-prompt":
                if request.method in ("GET", "HEAD"):
                    guard = await asyncio.to_thread(prompt_store.read_guard, DEFAULT_GUARD_PROMPT)
                    response = JSONResponse({"guardPrompt": guard, "maxLength": MAX_PROMPT_LENGTH})
                    return Response(headers=dict(response.headers)) if request.method == "HEAD" else response
                if request.method != "PUT":
                    raise APIError(405, "METHOD_NOT_ALLOWED", "守门提示词支持读取和保存。", {"Allow": "GET, HEAD, PUT"})
                body = await read_request_json(request, MAX_SETTINGS_BYTES)
                try:
                    guard = validate_prompt(body.get("guardPrompt") if isinstance(body, dict) else None)
                except ValueError as error:
                    raise APIError(400, "INVALID_PROMPT", str(error)) from None
                async with prompt_lock:
                    await asyncio.to_thread(prompt_store.write_guard, guard)
                return JSONResponse({"guardPrompt": guard, "maxLength": MAX_PROMPT_LENGTH})
            if raw_path == b"/api/safety/check":
                if request.method != "POST":
                    raise APIError(405, "METHOD_NOT_ALLOWED", "请使用提交方式请求审查。", {"Allow": "POST"})
                body = await read_request_json(request, MAX_REQUEST_BYTES)
                try:
                    payload = validate_guard_payload(body)
                except GuardError as error:
                    raise APIError(400, "INVALID_QUESTION", str(error)) from None
                guard_prompt = await asyncio.to_thread(prompt_store.read_guard, DEFAULT_GUARD_PROMPT)
                try:
                    result = await asyncio.wait_for(
                        guard_question(application.state.client, key, payload, guard_prompt),
                        timeout=min(GUARD_TIMEOUT_SECONDS, timeout_seconds),
                    )
                except (TimeoutError, asyncio.TimeoutError):
                    result = fallback_guard(payload["question"])
                return JSONResponse(result)
            if raw_path in STATIC_FILES:
                if request.method not in ("GET", "HEAD"):
                    raise APIError(405, "METHOD_NOT_ALLOWED", "此页面仅支持读取。", {"Allow": "GET, HEAD"})
                filename, media_type = STATIC_FILES[raw_path]
                content = await asyncio.to_thread((APP_DIR / filename).read_bytes)
                return Response(content=b"" if request.method == "HEAD" else content,
                                headers={"Content-Type": media_type, "Content-Length": str(len(content)), "Cache-Control": "no-cache"})
            if raw_path not in (b"/api/interpret", b"/api/debug/interpret"):
                raise APIError(404, "NOT_FOUND", "未找到所请求的内容。")
            if request.method != "POST":
                raise APIError(405, "METHOD_NOT_ALLOWED", "请使用提交方式请求解卦。", {"Allow": "POST"})
            debug = raw_path == b"/api/debug/interpret"
            body = await read_request_json(request, MAX_SETTINGS_BYTES if debug else MAX_REQUEST_BYTES)
            data = canonicalize(body)
            if debug:
                try:
                    prompt = validate_prompt(body.get("systemPrompt"))
                except ValueError as error:
                    raise APIError(400, "INVALID_PROMPT", str(error)) from None
            else:
                prompt = await asyncio.to_thread(prompt_store.read)
            if not configured:
                raise APIError(503, "SERVICE_NOT_CONFIGURED", "尚未配置解卦服务，请先完成服务端配置。")
            try:
                result = await interpret_until_disconnect(request, application.state.client, key, data, timeout_seconds, prompt)
            except (TimeoutError, asyncio.TimeoutError, httpx.TimeoutException):
                raise APIError(504, "UPSTREAM_TIMEOUT", "解卦等待超时，请稍后重试。") from None
            except APIError:
                raise
            except Exception as error:
                # Only log the exception class; provider details may contain credentials.
                logger.warning("DeepSeek request failed: type=%s", type(error).__name__)
                raise APIError(502, "UPSTREAM_FAILED", "解卦服务暂不可用，请稍后重试。") from None
            return JSONResponse(result)
        except APIError as error:
            return error_response(error)
        except PromptConfigError as error:
            return error_response(APIError(503, "PROMPT_CONFIG_UNAVAILABLE", str(error)))
        except Exception:
            return error_response(APIError(500, "INTERNAL_ERROR", "服务暂时无法完成请求，请稍后重试。"))

    return application


load_local_env()
app = create_app()

if __name__ == "__main__":
    import uvicorn

    host = os.environ.get("HOST", "").strip() or "0.0.0.0"
    try:
        port = int(os.environ.get("PORT", "2468"))
        if not 1 <= port <= 65535:
            raise ValueError
    except ValueError:
        raise SystemExit("问玄启动失败：PORT 必须是1至65535之间的整数。") from None
    uvicorn.run(app, host=host, port=port, access_log=False)

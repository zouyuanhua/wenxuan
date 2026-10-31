# -*- coding: utf-8 -*-
"""本地预览服务器(零依赖,纯标准库)。

用途:在没有 fastapi/httpx 依赖的环境里预览「问玄」前端与摇卦全流程。
- 静态文件服务(静态清单与 app.py 保持一致)
- GET  /api/health     → {"status":"ok","mode":"preview"}
- POST /api/interpret  → 按「服务端重算卦象 → 64卦数据库取典籍原文 → 组装解读」
                         的真实数据流生成演示解读(不调用任何 AI,引文全部来自数据库)

注意:这是开发预览工具,不是产品后端;正式部署仍应使用 app.py(FastAPI + 真实 AI)。
启动:python dev_server.py  →  http://127.0.0.1:2468
"""
import json
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

import gua_classics
from followup import FollowupError, validate_followup
from hexagram import change_lines, classify_coins, describe_hexagram

ROOT = Path(__file__).resolve().parent
STATIC = {
    "/": "index.html", "/index.html": "index.html", "/prompt.html": "prompt.html",
    "/css/style.css": "css/style.css", "/css/prompt.css": "css/prompt.css",
    "/js/app.js": "js/app.js", "/js/hexagram.js": "js/hexagram.js",
    "/js/prompt.js": "js/prompt.js", "/js/ask-data.js": "js/ask-data.js",
    "/css/paipan.css": "css/paipan.css",
    "/js/liuyao.js": "js/liuyao.js", "/js/paipan.js": "js/paipan.js",
    "/js/vendor/lunar.min.js": "js/vendor/lunar.min.js",
}
CONTENT_TYPES = {".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8",
                 ".js": "application/javascript; charset=utf-8"}
POSITIONS = ("初爻", "二爻", "三爻", "四爻", "五爻", "上爻")


def build_demo_interpretation(lines, moving):
    """按真实数据流生成演示解读:所有引文取自 64gua.json,不经过任何 AI。"""
    ben = gua_classics.GUA_BY_ID.get(gua_classics.hexagram_id(lines))
    if not ben:
        return "【本地演示】数据库不可用,无法生成解读。"
    bian = gua_classics.GUA_BY_ID.get(gua_classics.changed_hexagram_id(lines))
    parts = ["【本地演示解读 · 引文实时取自 64 卦典籍数据库,未接入真实 AI】", ""]
    parts.append(f"所问与卦象：本卦「{ben.get('name', '')}」，卦辞曰：「{ben.get('gua_ci', '')}」"
                 f"象曰：「{ben.get('da_xiang', '')}」。")
    if moving:
        yao = ben.get("yao_ci") or []
        quotes = "；".join(yao[position - 1] for position in moving if 0 <= position - 1 < len(yao))
        text = f"动爻与变化：{quotes}。"
        if bian and bian.get("id") != ben.get("id"):
            text += f"动爻阴阳互换，得变卦「{bian.get('name', '')}」，卦辞曰：「{bian.get('gua_ci', '')}」。"
        parts.append(text)
    else:
        parts.append("动爻与变化：六爻皆静，阴阳不变，事态以本卦卦义为主，宜守不宜进。")
    parts.append("可行建议：一、先依卦辞之意明确方向，不急躁；二、把大的决定拆成可回头的小步；"
                 "三、择一个可信之人交换看法，再定行止。")
    parts.append("—— 以上引文来自《周易》原文（64gua.json）；仅供文化娱乐参考，"
                 "不构成医疗、法律、投资、婚姻等专业建议。")
    return "\n".join(parts)


class PreviewHandler(BaseHTTPRequestHandler):
    server_version = "WenXuanPreview/0.2"

    def log_message(self, *args):  # 安静模式
        pass

    def _send(self, code, body, ctype):
        data = body.encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        path = self.path.split("?", 1)[0]
        if path in ("/api/health", "/api/health/"):
            return self._send(200, '{"status":"ok","mode":"preview","database":%d}'
                              % len(gua_classics.GUA_BY_ID), "application/json; charset=utf-8")
        rel = STATIC.get(path)
        if rel is None:
            return self._send(404, "not found", "text/plain; charset=utf-8")
        try:
            body = (ROOT / rel).read_text("utf-8")
        except OSError:
            return self._send(404, "not found", "text/plain; charset=utf-8")
        suffix = "." + rel.rsplit(".", 1)[-1]
        return self._send(200, body, CONTENT_TYPES.get(suffix, "text/plain; charset=utf-8"))

    def do_POST(self):
        path = self.path.split("?", 1)[0]
        if path not in ("/api/interpret", "/api/debug/interpret"):
            return self._send(404, "not found", "text/plain; charset=utf-8")
        length = int(self.headers.get("Content-Length") or 0)
        raw = self.rfile.read(length) if length else b"{}"
        try:
            body = json.loads(raw.decode("utf-8"))
        except ValueError:
            return self._send(400, '{"error":{"code":"INVALID_JSON","message":"请求内容无法读取。"}}',
                              "application/json; charset=utf-8")
        try:
            lines = [classify_coins(item.get("coins")) for item in body.get("lines", [])]
        except (ValueError, AttributeError):
            return self._send(400, '{"error":{"code":"INVALID_COINS","message":"每爻必须包含三枚有效铜钱。"}}',
                              "application/json; charset=utf-8")
        if len(lines) != 6:
            return self._send(400, '{"error":{"code":"INCOMPLETE_CAST","message":"请完成六次摇卦后再解卦。"}}',
                              "application/json; charset=utf-8")
        moving = [index + 1 for index, line in enumerate(lines) if line["moving"]]
        data = {"lines": lines, "movingLines": moving}
        try:
            followup = validate_followup(body.get("followup"))
        except FollowupError as error:
            payload = json.dumps({"error": {"code": "INVALID_FOLLOWUP", "message": str(error)}},
                                 ensure_ascii=False)
            return self._send(400, payload, "application/json; charset=utf-8")
        if followup:
            ben = gua_classics.GUA_BY_ID.get(gua_classics.hexagram_id(lines)) or {}
            yao = ben.get("yao_ci") or []
            quotes = "；".join(yao[position - 1] for position in moving if 0 <= position - 1 < len(yao))
            interpretation = (f"【本地演示 · 第{followup['index']}次追问 · 引文取自典籍数据库，未接入真实 AI】\n\n"
                              f"就「{followup['question']}」：仍以本卦卦辞与动爻爻辞为依据——{quotes}。\n\n"
                              "从卦象看，此问不离原事：建议回到上方「可行建议」，先做能确定的小步，再观其变。\n\n"
                              "—— 仅供文化娱乐参考，不构成专业建议。")
        else:
            interpretation = build_demo_interpretation(lines, moving)
        payload = json.dumps({
            "interpretation": interpretation,
            "classics": gua_classics.classics_summary(data),
            "hexagram": {"primary": describe_hexagram(lines),
                         "changed": describe_hexagram(change_lines(lines)),
                         "movingLines": moving},
        }, ensure_ascii=False)
        return self._send(200, payload, "application/json; charset=utf-8")


if __name__ == "__main__":
    print("问玄本地预览服务: http://127.0.0.1:2468  (Ctrl+C 停止)")
    ThreadingHTTPServer(("127.0.0.1", 2468), PreviewHandler).serve_forever()

# -*- coding: utf-8 -*-
"""本地预览服务器(零依赖,纯标准库)。

用途:在没有 fastapi/httpx 依赖的环境里预览「问玄」前端与摇卦全流程。
- 静态文件服务(静态清单与 app.py 保持一致)
- GET  /api/health     → {"status":"ok","mode":"preview"}
- POST /api/interpret  → 返回标注为【本地演示】的固定解读(不调用任何 AI)

注意:这是开发预览工具,不是产品后端;正式部署仍应使用 app.py(FastAPI + 真实 AI)。
启动:python dev_server.py  →  http://127.0.0.1:2468
"""
import json
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parent
STATIC = {
    "/": "index.html", "/index.html": "index.html", "/prompt.html": "prompt.html",
    "/css/style.css": "css/style.css", "/css/prompt.css": "css/prompt.css",
    "/js/app.js": "js/app.js", "/js/hexagram.js": "js/hexagram.js",
    "/js/prompt.js": "js/prompt.js", "/js/ask-data.js": "js/ask-data.js",
}
CONTENT_TYPES = {".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8",
                 ".js": "application/javascript; charset=utf-8"}

MOCK_INTERPRETATION = (
    "【本地演示解读 · 未接入真实 AI 服务】\n\n"
    "一、卦象直读：此卦如晨雾行山，路未明而向已定，事在两可之间。\n"
    "二、核心矛盾：当下的犹豫，来自对时机的不确定，而非方向本身有误。\n"
    "三、趋势判断：平，待时机。静养其势，不宜强推。\n"
    "四、行动建议：其一，把决定推迟一个周期，先观察变化；其二，补齐尚缺的关键信息；其三，与一位可信的人交换看法再定。\n"
    "五、典籍引证：《周易》云：「君子以自昭明德。」\n\n"
    "—— 内容基于传统文化典籍生成，仅供文化娱乐参考，不构成医疗、法律、投资、婚姻等专业建议。"
)


class PreviewHandler(BaseHTTPRequestHandler):
    server_version = "WenXuanPreview/0.1"

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
            return self._send(200, '{"status":"ok","mode":"preview"}', "application/json; charset=utf-8")
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
        if length:
            self.rfile.read(length)
        payload = json.dumps({
            "interpretation": MOCK_INTERPRETATION,
            "classics": {
                "primary": {"guaCi": "乾：元亨，利贞。", "daXiang": "天行健，君子以自强不息。"},
                "changed": {"guaCi": "坤：元亨，利牝马之贞。君子有攸往，先迷后得主，利。西南得朋，东北丧朋。安贞吉。",
                            "daXiang": "地势坤，君子以厚德载物。"},
            },
        }, ensure_ascii=False)
        return self._send(200, payload, "application/json; charset=utf-8")


if __name__ == "__main__":
    print("问玄本地预览服务: http://127.0.0.1:2468  (Ctrl+C 停止)")
    ThreadingHTTPServer(("127.0.0.1", 2468), PreviewHandler).serve_forever()

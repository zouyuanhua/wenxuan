# 问玄 · 三钱六爻

前端使用 HTML、SVG、原生 JavaScript；服务端使用 FastAPI / Uvicorn，通过异步 HTTPX 调用 DeepSeek。服务端卦象计算使用纯 Python，无需 Node.js。

填写问题并点击「确认所问」，阅读静心提醒后，用同一组三枚铜钱摇六次。六爻落定后铜钱锁定，点击「解卦」将问题和六爻钱币数据提交给服务端，由 `deepseek-flash` 生成解读。请求中途失败可以重试，已锁定的问题及卦象不会改变；成功后再次查看不会重复调用模型。

## 启动

需要 Python 3.11 或更新版本。在此目录安装依赖并启动：

```powershell
python -m pip install -r requirements.txt
python app.py
```

然后打开 <http://127.0.0.1:3000>。`python app.py` 使用 Uvicorn 启动 FastAPI 应用，并读取 `HOST`、`PORT`。

也可以直接使用 Uvicorn 命令启动：

```powershell
python -m uvicorn app:app --host 127.0.0.1 --port 3000
```

开发时可在该命令后添加 `--reload`。使用 Uvicorn 命令时，监听地址和端口由其命令行参数决定。

服务端读取 `API_KEY_DS` 环境变量；已配置时无需重复设置。尚未配置时，可以将 `.env.example` 复制为本目录的 `.env`，填写密钥后再启动。已有进程环境变量优先于 `.env`。默认监听 `127.0.0.1:3000`，可通过 `HOST`、`PORT` 调整。

直接双击 `index.html` 仍可离线填写问题及摇卦；AI 解卦需启动服务并通过上述服务地址打开页面。API 密钥仅由服务端读取，不放入前端或网络响应。

## 提示词配置与在线调试

启动服务后，打开 <http://127.0.0.1:3000/prompt.html>，也可以点击首页的「提示词配置」入口。配置页在新标签页打开，方便保留正在摇出的卦象。

编辑提示词后，点击「立即保存」才会保存，页面显示保存状态；保存失败时可点击按钮重试。未保存的修改会保留在当前页面，离开时会提示确认。配置保存在 `config/prompt.json` 的 `system_prompt` 字段，支持换行，最多 20000 个字符。服务端每次新解卦都读取已保存的配置，无需重启；直接编辑该文件也会生效。文件损坏时会提示修复，可在配置页重新保存。

在线调试区可输入测试问题、设置从初爻到上爻的六爻四象，再点击「开始调试」，使用编辑器当时的提示词生成解读。每次调试都会调用 DeepSeek，可用相同问题和卦象反复检查提示词效果。模型同时收到服务端核对后的问题、本卦、变卦、动爻及六爻记录。调试问题和结果不写入配置文件。

## 接口

`POST /api/interpret`，请求类型 `application/json`：

```json
{
  "question": "我应该如何安排下一阶段的学习？",
  "lines": [
    { "coins": ["back", "back", "back"] },
    { "coins": ["front", "front", "front"] },
    { "coins": ["back", "back", "front"] },
    { "coins": ["front", "front", "back"] },
    { "coins": ["back", "front", "back"] },
    { "coins": ["front", "back", "front"] }
  ]
}
```

`lines` 按初爻至上爻排列，必须正好六爻，每爻三枚钱币。`back` 为背面，`front` 为字面。问题去除首尾空白后须为 1–2000 个字符。

服务端根据钱币重新计算阴阳、动爻、本卦和变卦，不依赖客户端提交的卦名或阴阳值。三背为老阳、三字为老阴，两背一字为少阴，两字一背为少阳。

成功响应包含 `interpretation`（解读文本）、`model` 和 `hexagram`（本卦、变卦、动爻位置）；失败返回 `error.code` 与 `error.message`。`GET /api/health` 可检查服务状态和密钥是否配置，不返回密钥。

服务端将经过核对的卦象和用户问题发送至 DeepSeek，不持久化问题或解读。上游请求设有超时，错误信息不透出上游认证信息。前端将模型输出作为文本展示。

`GET /api/settings/prompt` 读取配置，返回 `systemPrompt` 和 `maxLength`。`PUT /api/settings/prompt` 接收 `{ "systemPrompt": "提示词正文" }`，原子写入配置文件并返回保存后的配置。保存不会修改已发出的模型请求。

`POST /api/debug/interpret` 在普通解卦请求的 `question`、`lines` 之外，增加 `systemPrompt` 字段，使用这份提示词草稿调试；响应结构与普通解卦一致。调试不会保存提示词，需在配置页点击「立即保存」才能更新配置。提示词配置与调试请求最多 128 KiB，普通解卦请求最多 32 KiB。

## 验证

```powershell
python -m unittest discover -s tests -v
```

自动化服务端测试使用 Python 标准库 unittest、FastAPI TestClient / HTTPX 模拟上游，不调用付费接口。测试覆盖请求校验、六十四卦与前端的一致性、上游响应和超时、断开取消、静态文件边界、密钥隔离、提示词持久化与实时读取、在线调试草稿及配置错误处理。

实现参考：[FastAPI 生命周期](https://fastapi.tiangolo.com/advanced/events/)、[Uvicorn 启动配置](https://www.uvicorn.org/settings/)、[DeepSeek Chat Completions](https://api-docs.deepseek.com/api/create-chat-completion/)。

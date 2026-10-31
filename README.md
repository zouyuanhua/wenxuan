# 问玄 WenXuan

> 心有惑，一卦问玄 —— 基于周易卦象的 AI 问事助手

**确定性排盘引擎 × 典籍数据库防幻觉 × LLM 叙事解读 × 追问闭环**

![status](https://img.shields.io/badge/status-P0%E9%AA%8C%E8%AF%81%E6%9C%9F-orange) ![python](https://img.shields.io/badge/Python-3.11+-blue) ![license](https://img.shields.io/badge/license-MIT-green)

## 项目简介

「问玄」以周易六十四卦体系为核心引擎，做"AI 玄学问事"产品：

- **代码算**：起卦、装卦、动爻、变卦全部由确定性代码完成，排盘 100% 准确
- **典籍护**：解读引用的卦辞/爻辞逐字来自 64 卦典籍数据库，并在卦卡上展示供用户核对——引文零幻觉
- **AI 讲**：LLM 基于排盘结果与典籍原文做白话叙事解读，不当"算卦人"，只当"解卦人"
- **训练师管质量**：AI 训练师团队负责知识库构建、卦例标注、输出质检与红队测试

## 核心流程（已实现）

```
问事台(8+1 分类 · 子项模板 · 疏文 5-200 字)
  → 疏文焚化，问题与分类锁定
  → 三钱摇卦(六爻，自下而上)
  → 服务端重算卦象(本卦/变卦/动爻，纯代码)
  → 查 64 卦典籍数据库 → AI 五段式解读(引文逐字可核对) + 免责声明
  → 追问循环(同卦最多 3 次，超限收尾"此卦已尽")
```

## 目录结构

```
wenxuan/
├── src/                  # 产品源码(Web/H5 + FastAPI 后端)
│   ├── app.py            # FastAPI 服务(/api/interpret 等)
│   ├── hexagram.py       # 摇卦与 64 卦规则(服务端重算，不信任前端)
│   ├── gua_classics.py   # 典籍依据构建(防幻觉，FR-03 知识检索层)
│   ├── followup.py       # 追问校验(前后端共用，FR-05)
│   ├── config/           # prompt.json 系统提示词 · 64gua.json 典籍数据库
│   ├── index.html 等     # 前端(问事台/摇卦/解卦/追问/提示词配置)
│   ├── dev_server.py     # 零依赖本地预览服务器(解读为演示数据)
│   └── tests/            # unittest 测试
├── miniprogram/          # 微信小程序版(原生，FR-01~05 全量)
├── engine/               # 卦象引擎参考实现 + 概率分布/确定性单测
├── docs/                 # 项目方案与 SRS(v0.2，含附录A 交互规格)
├── knowledge/            # 知识库规划(64 卦基础库已导入 src/config)
├── prompts/              # Prompt 工程约定
├── server/               # 服务层规划说明
└── wenxuan_prd.html      # PRD(AI 编程实训营模板)
```

## 快速开始

### Web / H5 版（src/）

环境：Python 3.11+。进入 `src/` 目录：

```bash
pip install -r requirements.txt
python app.py
```

- 默认监听 `0.0.0.0:2468`（读取 `HOST`/`PORT` 环境变量）。**开发时建议 `HOST=127.0.0.1`**，然后打开 <http://127.0.0.1:2468>。
- 也可以用 Uvicorn 命令启动（监听由命令行参数决定）：
  ```bash
  python -m uvicorn app:app --host 127.0.0.1 --port 2468 --reload
  ```
- **AI 解卦需配置密钥**：复制 `.env.example` 为 `.env`，填入 `API_KEY_DS=...`。进程环境变量优先于 `.env`。未配置时问事/摇卦正常，解卦返回 503 提示。
- **零依赖预览**：`python dev_server.py`（无需安装依赖；解读为演示数据，但引文仍实时取自典籍数据库）。
- 直接双击 `index.html` 可离线问事与摇卦；AI 解卦需经服务地址打开页面。API 密钥仅由服务端读取，不放入前端或网络响应。

### 微信小程序版（miniprogram/）

微信开发者工具 → 导入 `miniprogram/` 目录 → 详情/本地设置勾选「不校验合法域名」→ 后端地址在 `utils/api.js` 的 `BASE_URL` 修改。详见 [miniprogram/README.md](miniprogram/README.md)。

## 提示词配置与在线调试

启动服务后打开 `/prompt.html`（或点首页「提示词配置」）。编辑后点「立即保存」才落盘，保存于 `config/prompt.json` 的 `system_prompt`（≤20000 字符），每次新解卦即时读取，无需重启。在线调试区可用草稿提示词试跑解读，调试内容不写入配置文件。

## 接口

`POST /api/interpret`（`application/json`）：

```json
{
  "question": "这份工作要不要换？",
  "lines": [
    { "coins": ["back", "back", "back"] },
    { "coins": ["front", "front", "front"] },
    { "coins": ["back", "back", "front"] },
    { "coins": ["front", "front", "back"] },
    { "coins": ["back", "front", "back"] },
    { "coins": ["front", "back", "front"] }
  ],
  "followup": {
    "index": 1,
    "question": "时机上还有什么提示？",
    "history": []
  }
}
```

- `lines` 按初爻至上爻排列，必须正好六爻；`back`=背面，`front`=字面。服务端**根据钱币重算**阴阳/动爻/本卦/变卦，不信任客户端提交的术数值（三背=老阳、三字=老阴、两背一字=少阴、两字一背=少阳）。
- `followup` 缺省为首次解卦；携带时为追问（`index` 1..3，`history` 为此前追问问答），回答仍受同一卦象与典籍依据约束。
- 成功响应：`interpretation`（解读+免责声明）、`model`、`hexagram`（本卦/变卦/动爻位置）、`classics`（本卦/变卦卦辞摘要，供前端展示）。
- 失败响应：`error.code` 与 `error.message`（如追问超限返回 400"此卦已尽，建议心定后另择时再问"）。
- `GET /api/health`：服务状态与密钥是否已配置（不返回密钥）。
- `GET|PUT /api/settings/prompt`：提示词读取/保存；`POST /api/debug/interpret`：草稿提示词调试。请求上限：解卦 32KiB、配置与调试 128KiB。

## 测试

```bash
# src/ 下运行（需先安装 requirements.txt，测试不调用付费接口）
python -m unittest discover -s tests -v

# 摇卦引擎概率/确定性测试（纯标准库，可直接运行）
python engine/tests/test_yaogua.py
```

覆盖：请求校验、六十四卦一致性、钱象穷举与 64 卦全量核对、概率分布（5 万爻）、种子确定性、追问校验（11 项）、典籍数据库与防幻觉 grounding、上游超时/断连取消、密钥隔离、提示词持久化。

## 已知边界

- 问事与解读**暂不持久化**（NFR-01 规划中，P1 以本地存储起步）
- `app.py` 缺省监听 `0.0.0.0`（安全加固项已登记：建议改 `127.0.0.1` 并收敛 prompt 设置端点）
- 小程序端音效以震动反馈替代（Web Audio 不可用）

## 免责声明

本项目内容基于传统文化典籍生成，**仅供文化娱乐参考**，不构成医疗、法律、投资、婚姻等专业建议；不预测命运，不提供付费改运服务。

## License

[MIT](LICENSE)

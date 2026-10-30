# 问玄 WenXuan

> 心有惑,一卦问玄 —— 基于周易卦象的 AI 问事助手

**确定性排盘引擎 × LLM 叙事解读 × 卦例应验闭环**

![status](https://img.shields.io/badge/status-P0%E9%AA%8C%E8%AF%81%E6%9C%9F-orange) ![python](https://img.shields.io/badge/Python-3.11+-blue) ![license](https://img.shields.io/badge/license-MIT-green)

## 项目简介

「问玄」以周易六十四卦体系为核心引擎,做"AI 玄学问事"产品:

- **代码算**:起卦、纳甲、装卦、旺衰判定全部由确定性代码完成,排盘 100% 准确
- **AI 讲**:LLM 基于排盘结果与典籍知识库(RAG)做白话叙事解读,不当"算卦人",只当"解卦人"
- **训练师管质量**:AI 训练师团队负责知识库构建、卦例标注、输出质检与红队测试

## 核心流程

```
用户提问(事业/感情/财运/决策)
  → 起卦(梅花时间卦/报数卦 · 六爻摇卦)
  → 排盘引擎(干支/纳甲/六亲/世应/旺衰,纯代码)
  → AI 解读(LLM + 卦辞爻辞 RAG,三层管线)
  → 卦象卡片 + 解读报告 + 分享海报
  → 7 日后应验打卡,沉淀卦例数据
```

## 目录结构

```
wenxuan/
├── docs/proposal/     # 项目方案文档(评审稿)
├── engine/            # 卦象引擎:农历干支、梅花起卦、六爻纳甲、旺衰规则
│   └── tests/         # 卦例回测单测(目标:古籍 100 卦例 100% 对齐)
├── server/            # FastAPI 业务服务
├── knowledge/         # 知识库:64卦基础库/纳甲规则/六亲类象/卦例库
└── prompts/           # Prompt 模板与版本管理
```

## 快速开始(规划)

```bash
# 环境:Python 3.11+
pip install -r requirements.txt
uvicorn server.main:app --reload
```

## 免责声明

本项目内容基于传统文化典籍生成,**仅供文化娱乐参考**,不构成医疗、法律、投资、婚姻等专业建议。

## License

[MIT](LICENSE)

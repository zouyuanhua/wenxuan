# server —— FastAPI 业务服务

## 职责

问事服务、起卦接口、解读管线编排(LLM + RAG + 一致性校验 + 安全过滤)、
付费与会员、应验打卡召回。

## 规划端点(P0)

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/api/divination` | 创建问事并起卦(入参:问题、分类、起卦方式) |
| GET | `/api/divination/{id}` | 获取卦象数据 + 解读报告 |
| POST | `/api/divination/{id}/followup` | 追问(限 2-3 轮) |
| GET | `/api/daily-fortune` | 每日运势(签到钩子) |
| POST | `/api/divination/{id}/verify` | 应验打卡 |

## 技术约定

- Python 3.11+ / FastAPI / Uvicorn
- 排盘调用 `engine`,禁止在服务层自行实现术数逻辑
- 卦象 JSON 全量落库(即训练数据资产)
- 每次解读输出末尾强制附免责声明(安全层保证)

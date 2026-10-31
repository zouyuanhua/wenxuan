# -*- coding: utf-8 -*-
"""追问循环(FR-05)负载校验:纯标准库,前后端共用。

规则(SRS FR-05 / 决议 D-02):
- 上限 3 次追问;第 index 次追问的 history 必须恰好是前 index-1 条问答
- 追问必须围绕本卦与原问题(偏离由 system 指令约束,这里做长度与结构校验)
- 无状态设计:前端持有 history,服务端不存储
"""
MAX_FOLLOWUP_ROUNDS = 3
MAX_FOLLOWUP_QUESTION = 200
MAX_HISTORY_ANSWER = 20000


class FollowupError(ValueError):
    """追问校验失败;message 为用户可读文案。"""


def validate_followup(raw):
    """校验并规范化追问负载;缺失时返回 None。

    返回 {"index": int, "question": str, "history": [{"question","answer"}...]}。
    """
    if raw is None:
        return None
    if not isinstance(raw, dict):
        raise FollowupError("追问格式不正确，请重新输入。")
    question = raw.get("question")
    if type(question) is not str or not question.strip():
        raise FollowupError("追问内容未落笔，先写下你想问的。")
    question = question.strip()
    if len(question) > MAX_FOLLOWUP_QUESTION:
        raise FollowupError("追问也请精简，不超过 200 字。")
    history = raw.get("history")
    if history is None:
        history = []
    if not isinstance(history, list) or len(history) >= MAX_FOLLOWUP_ROUNDS:
        raise FollowupError("此卦已尽，建议心定后另择时再问。")
    cleaned = []
    for item in history:
        if not isinstance(item, dict):
            raise FollowupError("追问记录异常，请刷新页面后重试。")
        entry_question = item.get("question")
        entry_answer = item.get("answer")
        if (type(entry_question) is not str or not entry_question.strip()
                or type(entry_answer) is not str or not entry_answer.strip()):
            raise FollowupError("追问记录异常，请刷新页面后重试。")
        cleaned.append({"question": entry_question.strip()[:500],
                        "answer": entry_answer.strip()[:MAX_HISTORY_ANSWER]})
    index = len(cleaned) + 1
    provided = raw.get("index")
    if provided is not None:
        if type(provided) is not int or isinstance(provided, bool) or provided != index:
            raise FollowupError("追问次数异常，请刷新页面后重试。")
    return {"index": index, "question": question, "history": cleaned}

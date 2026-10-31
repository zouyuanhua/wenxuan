# -*- coding: utf-8 -*-
"""64 卦典籍数据库加载与「典籍依据」构建(FR-03 知识检索层,防幻觉)。

数据文件:src/config/64gua.json(64 条;id 为自下而上的阴阳二进制串,
如 101010=既济;字段含 gua_ci 卦辞 / tuan_ci 彖辞 / da_xiang 大象 /
yao_ci 爻辞(下标 0..5 为初爻到上爻,6 为用九/用六)/ xiao_xiang 小象)。

纯标准库实现,不依赖 fastapi,便于独立单测;数据库缺失时优雅降级(返回空)。
"""
import json
from pathlib import Path

APP_DIR = Path(__file__).resolve().parent
DATABASE_PATH = APP_DIR / "config" / "64gua.json"
YAO_POSITIONS = ("初爻", "二爻", "三爻", "四爻", "五爻", "上爻")


def load_database(path=None):
    """加载数据库;文件缺失或损坏时返回空 dict(功能优雅降级)。"""
    target = Path(path) if path else DATABASE_PATH
    try:
        with open(target, encoding="utf-8") as fh:
            entries = json.load(fh)
    except (OSError, ValueError):
        return {}
    if not isinstance(entries, list):
        return {}
    return {entry["id"]: entry for entry in entries
            if isinstance(entry, dict) and isinstance(entry.get("id"), str)}


GUA_BY_ID = load_database()


def hexagram_id(lines):
    """由六爻列表(含 yang 布尔)生成自下而上的二进制 id。"""
    return "".join("1" if line.get("yang") else "0" for line in lines)


def changed_hexagram_id(lines):
    """变卦 id:动爻阴阳翻转,静爻不变。"""
    bits = []
    for line in lines:
        yang = bool(line.get("yang"))
        bits.append(("0" if yang else "1") if line.get("moving") else ("1" if yang else "0"))
    return "".join(bits)


def _entry_lines(entry):
    yield "卦辞：" + str(entry.get("gua_ci", "")).strip()
    da_xiang = str(entry.get("da_xiang", "")).strip()
    if da_xiang:
        yield "象曰：" + da_xiang


def classics_grounding(data, database=None):
    """构建注入 LLM 的「典籍依据」文本块;数据库不可用时返回空串。

    内容:本卦卦辞/大象 + 全部动爻的爻辞/小象 + 变卦卦辞/大象,
    并附带防幻觉指令(原文之外的引文一律禁止)。
    """
    db = GUA_BY_ID if database is None else database
    if not db:
        return ""
    lines = data.get("lines") or []
    if len(lines) != 6:
        return ""
    moving = [int(p) for p in (data.get("movingLines") or [])
              if isinstance(p, (int, float)) and 1 <= int(p) <= 6]
    ben = db.get(hexagram_id(lines))
    bian = db.get(changed_hexagram_id(lines))
    if not ben:
        return ""
    blocks = ["【典籍依据】以下是《周易》原文，来自服务端六十四卦数据库。"
              "你的解读必须且只能以下列原文作为卦辞、爻辞、象传依据；"
              "下列原文中没有的引文一律不得编造、改写或拼接。"]
    blocks.append(f"本卦「{ben.get('name', '')}」：" + " ".join(_entry_lines(ben)))
    for position in moving:
        index = position - 1
        yao = ben.get("yao_ci") or []
        xiang = ben.get("xiao_xiang") or []
        if index < len(yao) and index < len(xiang):
            blocks.append(f"{YAO_POSITIONS[index]}动爻爻辞：{yao[index]}　小象曰：{xiang[index]}")
    if bian and bian.get("id") != ben.get("id"):
        blocks.append(f"变卦「{bian.get('name', '')}」：" + " ".join(_entry_lines(bian)))
    elif not moving:
        blocks.append("本卦六爻皆静（无动爻）。")
    return "\n".join(blocks)


def classics_summary(data, database=None):
    """返回给前端展示的卦辞摘要;数据库不可用时返回 None。"""
    db = GUA_BY_ID if database is None else database
    if not db:
        return None
    lines = data.get("lines") or []
    if len(lines) != 6:
        return None

    def summary(entry):
        if not entry:
            return None
        return {"guaCi": entry.get("gua_ci", ""), "daXiang": entry.get("da_xiang", "")}

    return {
        "primary": summary(db.get(hexagram_id(lines))),
        "changed": summary(db.get(changed_hexagram_id(lines))),
    }

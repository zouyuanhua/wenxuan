"""Server-side coin rules and King Wen lookup; line zero is the bottom line.

The browser's js/hexagram.js uses the same mapping. Original sources:
https://zh.wikisource.org/wiki/周易
https://zh.wikisource.org/zh-hans/周易/說卦
"""

TRIGRAMS = (
    ("坤", "地"), ("震", "雷"), ("坎", "水"), ("兑", "泽"),
    ("艮", "山"), ("离", "火"), ("巽", "风"), ("乾", "天"),
)
# Each record is (name, upper trigram bits, lower trigram bits).
KING_WEN = (
    ("乾", 7, 7), ("坤", 0, 0), ("屯", 2, 1), ("蒙", 4, 2),
    ("需", 2, 7), ("讼", 7, 2), ("师", 0, 2), ("比", 2, 0),
    ("小畜", 6, 7), ("履", 7, 3), ("泰", 0, 7), ("否", 7, 0),
    ("同人", 7, 5), ("大有", 5, 7), ("谦", 0, 4), ("豫", 1, 0),
    ("随", 3, 1), ("蛊", 4, 6), ("临", 0, 3), ("观", 6, 0),
    ("噬嗑", 5, 1), ("贲", 4, 5), ("剥", 4, 0), ("复", 0, 1),
    ("无妄", 7, 1), ("大畜", 4, 7), ("颐", 4, 1), ("大过", 3, 6),
    ("坎", 2, 2), ("离", 5, 5), ("咸", 3, 4), ("恒", 1, 6),
    ("遁", 7, 4), ("大壮", 1, 7), ("晋", 5, 0), ("明夷", 0, 5),
    ("家人", 6, 5), ("睽", 5, 3), ("蹇", 2, 4), ("解", 1, 2),
    ("损", 4, 3), ("益", 6, 1), ("夬", 3, 7), ("姤", 7, 6),
    ("萃", 3, 0), ("升", 0, 6), ("困", 3, 2), ("井", 2, 6),
    ("革", 3, 5), ("鼎", 5, 6), ("震", 1, 1), ("艮", 4, 4),
    ("渐", 6, 4), ("归妹", 1, 3), ("丰", 1, 5), ("旅", 5, 4),
    ("巽", 6, 6), ("兑", 3, 3), ("涣", 6, 2), ("节", 2, 3),
    ("中孚", 6, 3), ("小过", 1, 4), ("既济", 2, 5), ("未济", 5, 2),
)
BY_BITS = {lower | (upper << 3): (index + 1, name, upper, lower)
           for index, (name, upper, lower) in enumerate(KING_WEN)}


def classify_coins(coins):
    if not isinstance(coins, list) or len(coins) != 3:
        raise ValueError("每爻必须恰好包含三枚钱币。")
    if any(type(coin) is not str or coin not in ("back", "front") for coin in coins):
        raise ValueError("钱币面只能是 back 或 front。")
    backs = coins.count("back")
    moving = backs in (0, 3)
    yang = backs in (1, 3)
    return {
        "coins": coins.copy(),
        "name": ("老阳" if yang else "老阴") if moving else ("少阳" if yang else "少阴"),
        "yang": yang,
        "moving": moving,
        "marker": ("○" if yang else "×") if moving else "",
        "backCount": backs,
    }


def _validate_lines(lines):
    if not isinstance(lines, list) or len(lines) != 6:
        raise ValueError("一卦必须恰好包含六爻，并按自下而上的顺序排列。")
    if any(not isinstance(line, dict) or type(line.get("yang")) is not bool for line in lines):
        raise ValueError("每爻必须用布尔值 yang 表示阴阳。")


def describe_hexagram(lines):
    _validate_lines(lines)
    bits = sum((1 << index) for index, line in enumerate(lines) if line["yang"])
    number, name, upper_bits, lower_bits = BY_BITS[bits]
    upper_name, upper_nature = TRIGRAMS[upper_bits]
    lower_name, lower_nature = TRIGRAMS[lower_bits]
    return {
        "number": number,
        "name": name,
        "fullName": (upper_name + "为" + upper_nature if upper_bits == lower_bits
                     else upper_nature + lower_nature + name),
        "symbol": chr(0x4DC0 + number - 1),
        "upper": {"name": upper_name, "nature": upper_nature},
        "lower": {"name": lower_name, "nature": lower_nature},
    }


def change_lines(lines):
    _validate_lines(lines)
    changed = []
    for line in lines:
        # Metadata records the original cast; only its yin/yang changes.
        item = {**line, "yang": not line["yang"] if line.get("moving") else line["yang"]}
        if isinstance(line.get("coins"), list):
            item["coins"] = line["coins"].copy()
        changed.append(item)
    return changed

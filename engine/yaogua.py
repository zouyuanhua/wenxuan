# -*- coding: utf-8 -*-
"""摇卦引擎(FR-02)—— 三枚铜钱摇六次,得本卦/动爻/变卦。

设计约定(SRS-v0.1 FR-02):
- 每次摇掷 = 3 枚独立公平硬币,每枚正反各 1/2
- 一背二字=少阳 37.5% / 二背一字=少阴 37.5% / 三背=老阳 12.5% / 三字=老阴 12.5%
- 老阳/老阴为动爻:阳变阴 / 阴变阳 → 推出变卦
- 纯标准库实现;随机源通过注入 random.Random 支持种子复现与统计测试

爻序:position 1-6 自下而上;1-3 爻为下卦,4-6 爻为上卦(1=阳,0=阴)。
"""
from __future__ import annotations

import random
from dataclasses import dataclass

YANG, YIN = "阳", "阴"

# ---------------------------------------------------------------- 爻

@dataclass(frozen=True)
class Yao:
    """一爻。label ∈ {少阳, 少阴, 老阳, 老阴};dynamic = 是否动爻。"""
    position: int      # 1-6,自下而上
    label: str
    yin_yang: str      # 本爻阴阳
    dynamic: bool

    @property
    def binary(self) -> int:
        """本爻阴阳的机器表示:1=阳,0=阴(变卦推导用本爻之体)。"""
        return 1 if self.yin_yang == YANG else 0

    def to_dict(self) -> dict:
        return {
            "pos": self.position,
            "label": self.label,
            "yin_yang": self.yin_yang,
            "dynamic": self.dynamic,
        }


def yao_from_backs(n_back: int, position: int) -> Yao:
    """由三枚铜钱的背面数(0-3)确定一爻。

    0 背(三字)=老阴  1 背=少阳  2 背=少阴  3 背=老阳
    """
    mapping = {
        0: ("老阴", YIN, True),
        1: ("少阳", YANG, False),
        2: ("少阴", YIN, False),
        3: ("老阳", YANG, True),
    }
    if n_back not in mapping:
        raise ValueError(f"背面数必须在 0-3,收到:{n_back}")
    label, yin_yang, dynamic = mapping[n_back]
    return Yao(position=position, label=label, yin_yang=yin_yang, dynamic=dynamic)


def shake_one_yao(rng: random.Random, position: int) -> Yao:
    """摇一爻:三枚独立硬币,每枚背面概率 1/2。"""
    n_back = sum(rng.random() < 0.5 for _ in range(3))
    return yao_from_backs(n_back, position)


def shake_hexagram(rng: random.Random) -> list[Yao]:
    """摇六次,自下而上(position 1→6)得六爻。"""
    return [shake_one_yao(rng, pos) for pos in range(1, 7)]

# ---------------------------------------------------------------- 八卦 / 六十四卦

# 三爻自下而上(1=阳,0=阴)→ 卦名、自然象
_TRIGRAMS: dict[tuple[int, int, int], tuple[str, str]] = {
    (1, 1, 1): ("乾", "天"),
    (1, 1, 0): ("兑", "泽"),
    (1, 0, 1): ("离", "火"),
    (1, 0, 0): ("震", "雷"),
    (0, 1, 1): ("巽", "风"),
    (0, 1, 0): ("坎", "水"),
    (0, 0, 1): ("艮", "山"),
    (0, 0, 0): ("坤", "地"),
}

# (上卦名, 下卦名) → 六十四卦名。上乾下离=天火同人。
HEXAGRAM_NAMES: dict[tuple[str, str], str] = {
    ("乾", "乾"): "乾为天", ("乾", "兑"): "天泽履", ("乾", "离"): "天火同人", ("乾", "震"): "天雷无妄",
    ("乾", "巽"): "天风姤", ("乾", "坎"): "天水讼", ("乾", "艮"): "天山遁", ("乾", "坤"): "天地否",
    ("兑", "乾"): "泽天夬", ("兑", "兑"): "兑为泽", ("兑", "离"): "泽火革", ("兑", "震"): "泽雷随",
    ("兑", "巽"): "泽风大过", ("兑", "坎"): "泽水困", ("兑", "艮"): "泽山咸", ("兑", "坤"): "泽地萃",
    ("离", "乾"): "火天大有", ("离", "兑"): "火泽睽", ("离", "离"): "离为火", ("离", "震"): "火雷噬嗑",
    ("离", "巽"): "火风鼎", ("离", "坎"): "火水未济", ("离", "艮"): "火山旅", ("离", "坤"): "火地晋",
    ("震", "乾"): "雷天大壮", ("震", "兑"): "雷泽归妹", ("震", "离"): "雷火丰", ("震", "震"): "震为雷",
    ("震", "巽"): "雷风恒", ("震", "坎"): "雷水解", ("震", "艮"): "雷山小过", ("震", "坤"): "雷地豫",
    ("巽", "乾"): "风天小畜", ("巽", "兑"): "风泽中孚", ("巽", "离"): "风火家人", ("巽", "震"): "风雷益",
    ("巽", "巽"): "巽为风", ("巽", "坎"): "风水涣", ("巽", "艮"): "风山渐", ("巽", "坤"): "风地观",
    ("坎", "乾"): "水天需", ("坎", "兑"): "水泽节", ("坎", "离"): "水火既济", ("坎", "震"): "水雷屯",
    ("坎", "巽"): "水风井", ("坎", "坎"): "坎为水", ("坎", "艮"): "水山蹇", ("坎", "坤"): "水地比",
    ("艮", "乾"): "山天大畜", ("艮", "兑"): "山泽损", ("艮", "离"): "山火贲", ("艮", "震"): "山雷颐",
    ("艮", "巽"): "山风蛊", ("艮", "坎"): "山水蒙", ("艮", "艮"): "艮为山", ("艮", "坤"): "山地剥",
    ("坤", "乾"): "地天泰", ("坤", "兑"): "地泽临", ("坤", "离"): "地火明夷", ("坤", "震"): "地雷复",
    ("坤", "巽"): "地风升", ("坤", "坎"): "地水师", ("坤", "艮"): "地山谦", ("坤", "坤"): "坤为地",
}


def trigram_name(lines: tuple[int, int, int]) -> str:
    """三爻(自下而上)→ 卦名,如 (1,0,1) → 离。"""
    try:
        return _TRIGRAMS[tuple(lines)][0]
    except KeyError:
        raise ValueError(f"非法三爻组合:{lines}(每爻须为 0/1)") from None


def hexagram_name(lines: list[int]) -> str:
    """六爻(自下而上,1=阳)→ 卦名,如 [1,0,1,1,1,1] → 天火同人。"""
    if len(lines) != 6:
        raise ValueError(f"须为六爻,收到 {len(lines)} 爻")
    lower = trigram_name(tuple(lines[0:3]))
    upper = trigram_name(tuple(lines[3:6]))
    return HEXAGRAM_NAMES[(upper, lower)]

# ---------------------------------------------------------------- 成卦 / 变卦

@dataclass(frozen=True)
class HexagramCast:
    """一次摇卦的完整结果:六爻 + 本卦名 + 变卦名(无动爻时为 None)。"""
    yaos: tuple[Yao, ...]
    ben_gua: str
    bian_gua: str | None

    def to_dict(self) -> dict:
        return {
            "yaos": [y.to_dict() for y in self.yaos],
            "ben_gua": {"name": self.ben_gua},
            "bian_gua": {"name": self.bian_gua} if self.bian_gua else None,
            "has_dynamic": any(y.dynamic for y in self.yaos),
        }


def resolve_cast(yaos: list[Yao]) -> HexagramCast:
    """由六爻推导本卦名与变卦名。

    动爻规则:老阳(阳)变阴、老阴(阴)变阳;静爻不变。
    全卦无动爻时,变卦为 None(静卦)。
    """
    if len(yaos) != 6:
        raise ValueError(f"须为六爻,收到 {len(yaos)} 爻")
    positions = [y.position for y in yaos]
    if positions != [1, 2, 3, 4, 5, 6]:
        raise ValueError(f"爻位须为 1-6 自下而上,收到:{positions}")

    ben_lines = [y.binary for y in yaos]
    bian_lines = [1 - y.binary if y.dynamic else y.binary for y in yaos]
    has_dynamic = any(y.dynamic for y in yaos)
    return HexagramCast(
        yaos=tuple(yaos),
        ben_gua=hexagram_name(ben_lines),
        bian_gua=hexagram_name(bian_lines) if has_dynamic else None,
    )


def shake(rng: random.Random) -> HexagramCast:
    """一次完整摇卦(摇六爻 + 推本卦/变卦)。"""
    return resolve_cast(shake_hexagram(rng))

# ---------------------------------------------------------------- CLI 演示

if __name__ == "__main__":
    result = shake(random.Random())
    for y in result.yaos:
        mark = {("老阳"): "○", ("老阴"): "×"}.get(y.label, " ")
        line = "━━━━━" if y.yin_yang == YANG else "━━ ━━"
        print(f"第{y.position}爻 {line} {y.label}{mark}")
    print(f"本卦:{result.ben_gua}")
    print(f"变卦:{result.bian_gua or '(无动爻,静卦)'}")

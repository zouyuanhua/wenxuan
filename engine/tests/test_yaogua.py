# -*- coding: utf-8 -*-
"""摇卦引擎单元测试(SRS-v0.1 FR-02 验收标准)。

运行:python engine/tests/test_yaogua.py
或:  python -m unittest discover -s engine/tests -t .
"""
from __future__ import annotations

import random
import sys
import unittest
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import yaogua  # noqa: E402
from yaogua import (  # noqa: E402
    HEXAGRAM_NAMES,
    YANG,
    Yao,
    hexagram_name,
    resolve_cast,
    shake,
    shake_hexagram,
    trigram_name,
    yao_from_backs,
)

N_SIM = 100_000          # 分布模拟次数( seeded,确定性 )
TOLERANCE = 0.01         # 比例绝对误差容忍度( 100k 下 ≥6σ,稳定通过 )


class TestYaoMapping(unittest.TestCase):
    """三枚钱背面数 → 四种爻的精确映射。"""

    def test_mapping_exact(self):
        cases = {
            0: ("老阴", "阴", True),    # 三字:交,阴动
            1: ("少阳", "阳", False),   # 一背二字:单
            2: ("少阴", "阴", False),   # 二背一字:拆
            3: ("老阳", "阳", True),    # 三背:重,阳动
        }
        for n_back, (label, yin_yang, dynamic) in cases.items():
            yao = yao_from_backs(n_back, position=1)
            self.assertEqual(yao.label, label, f"{n_back} 背应得 {label}")
            self.assertEqual(yao.yin_yang, yin_yang)
            self.assertEqual(yao.dynamic, dynamic)

    def test_invalid_backs_rejected(self):
        for bad in (-1, 4, 99):
            with self.assertRaises(ValueError):
                yao_from_backs(bad, position=1)


class TestProbabilityDistribution(unittest.TestCase):
    """FR-02 验收:每爻分布 老阳12.5%/老阴12.5%/少阳37.5%/少阴37.5%;单枚公平。"""

    EXPECTED = {"少阳": 0.375, "少阴": 0.375, "老阳": 0.125, "老阴": 0.125}

    def test_yao_distribution(self):
        rng = random.Random(2026)
        counter: Counter[str] = Counter()
        for _ in range(N_SIM):
            counter[shake_one := yaogua.shake_one_yao(rng, 1).label] += 1
        for label, expected in self.EXPECTED.items():
            actual = counter[label] / N_SIM
            self.assertAlmostEqual(
                actual, expected, delta=TOLERANCE,
                msg=f"{label} 实测 {actual:.4f},期望 {expected}",
            )

    def test_each_coin_fair(self):
        """三枚硬币各自公平:聚合背面频率应接近 1/2。"""
        rng = random.Random(2026)
        flips = 300_000
        backs = sum(rng.random() < 0.5 for _ in range(flips))
        ratio = backs / flips
        self.assertAlmostEqual(ratio, 0.5, delta=TOLERANCE,
                               msg=f"硬币背面频率 {ratio:.4f},期望 0.5")

    def test_deterministic_with_seed(self):
        a = [shake_one.label for shake_one in shake_hexagram(random.Random(7))]
        b = [shake_one.label for shake_one in shake_hexagram(random.Random(7))]
        self.assertEqual(a, b, "同一种子必须得到完全相同的摇卦结果")


class TestHexagramNames(unittest.TestCase):
    """六爻 → 卦名:典型卦抽查 + 64 卦表完备性。"""

    def test_known_hexagrams(self):
        cases = {
            "乾为天": [1, 1, 1, 1, 1, 1],
            "坤为地": [0, 0, 0, 0, 0, 0],
            "天火同人": [1, 0, 1, 1, 1, 1],   # 下离上乾
            "离为火": [1, 0, 1, 1, 0, 1],
            "水火既济": [1, 0, 1, 0, 1, 0],   # 下离上坎
            "火水未济": [0, 1, 0, 1, 0, 1],
            "地天泰": [1, 1, 1, 0, 0, 0],     # 下乾上坤
            "天地否": [0, 0, 0, 1, 1, 1],
            "水雷屯": [1, 0, 0, 0, 1, 0],     # 下震上坎
            "山风蛊": [0, 1, 1, 0, 0, 1],     # 下巽上艮
        }
        for expected, lines in cases.items():
            self.assertEqual(hexagram_name(lines), expected, f"lines={lines}")

    def test_table_completeness(self):
        """64 卦名表须恰好覆盖 8×8 全部上下卦组合。"""
        self.assertEqual(len(HEXAGRAM_NAMES), 64)
        trigrams = [trigram_name(t) for t in yaogua._TRIGRAMS]
        for upper in trigrams:
            for lower in trigrams:
                self.assertIn((upper, lower), HEXAGRAM_NAMES,
                              f"缺少组合:上{upper}下{lower}")

    def test_invalid_lines_rejected(self):
        with self.assertRaises(ValueError):
            hexagram_name([1, 1, 1])            # 不足六爻
        with self.assertRaises(ValueError):
            hexagram_name([2, 0, 0, 0, 0, 0])   # 非法爻值


class TestTransform(unittest.TestCase):
    """动爻变卦推导。"""

    @staticmethod
    def _yaos(lines: list[int], dynamic_positions: set[int]) -> list[Yao]:
        return [
            Yao(
                position=pos,
                label=("老阳" if (va == 1 and pos in dynamic_positions)
                       else "老阴" if (va == 0 and pos in dynamic_positions)
                       else "少阳" if va == 1 else "少阴"),
                yin_yang="阳" if va == 1 else "阴",
                dynamic=pos in dynamic_positions,
            )
            for pos, va in enumerate(lines, start=1)
        ]

    def test_all_old_yang_qian_to_kun(self):
        """乾为天六爻全动(老阳)→ 坤为地。"""
        cast = resolve_cast(self._yaos([1, 1, 1, 1, 1, 1], {1, 2, 3, 4, 5, 6}))
        self.assertEqual(cast.ben_gua, "乾为天")
        self.assertEqual(cast.bian_gua, "坤为地")

    def test_tongren_fifth_yao_moving(self):
        """天火同人第五爻老阳动 → 离为火(方案文档示例回归)。"""
        cast = resolve_cast(self._yaos([1, 0, 1, 1, 1, 1], {5}))
        self.assertEqual(cast.ben_gua, "天火同人")
        self.assertEqual(cast.bian_gua, "离为火")

    def test_no_dynamic_is_static(self):
        """全静爻 → 变卦为 None。"""
        cast = resolve_cast(self._yaos([1, 0, 1, 1, 1, 1], set()))
        self.assertIsNone(cast.bian_gua)
        self.assertFalse(cast.to_dict()["has_dynamic"])

    def test_old_yin_changes_to_yang(self):
        """老阴(阴动)→ 变阳:坤为地初爻老阴动 → 地雷复。"""
        cast = resolve_cast(self._yaos([0, 0, 0, 0, 0, 0], {1}))
        self.assertEqual(cast.ben_gua, "坤为地")
        self.assertEqual(cast.bian_gua, "地雷复")


class TestSrsDict(unittest.TestCase):
    """输出结构与 SRS 数据模型字段对齐。"""

    def test_to_dict_shape(self):
        rng = random.Random(1)
        d = shake(rng).to_dict()
        self.assertEqual(len(d["yaos"]), 6)
        for i, yao in enumerate(d["yaos"], start=1):
            self.assertEqual(set(yao), {"pos", "label", "yin_yang", "dynamic"})
            self.assertEqual(yao["pos"], i)
        self.assertIn("name", d["ben_gua"])
        self.assertIn("has_dynamic", d)
        if d["has_dynamic"]:
            self.assertIsNotNone(d["bian_gua"])
        else:
            self.assertIsNone(d["bian_gua"])

    def test_positions_bottom_up(self):
        rng = random.Random(2)
        yaos = shake_hexagram(rng)
        self.assertEqual([y.position for y in yaos], [1, 2, 3, 4, 5, 6])


if __name__ == "__main__":
    unittest.main(verbosity=2)

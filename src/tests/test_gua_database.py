# -*- coding: utf-8 -*-
"""64 卦典籍数据库与「典籍依据」构建测试(FR-03 知识检索层,防幻觉)。"""
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from gua_classics import (  # noqa: E402
    GUA_BY_ID,
    classics_grounding,
    classics_summary,
)


def fake_data(lines_bits, moving=()):
    lines = [{"yang": bit == "1", "moving": (index + 1) in moving}
             for index, bit in enumerate(lines_bits)]
    return {"lines": lines, "movingLines": sorted(moving)}


class TestDatabase(unittest.TestCase):
    def test_64_unique_entries(self):
        self.assertEqual(len(GUA_BY_ID), 64)
        self.assertEqual(len(set(GUA_BY_ID)), 64)

    def test_id_orientation_is_bottom_up(self):
        self.assertEqual(GUA_BY_ID["101010"]["name"], "既济")
        self.assertEqual(GUA_BY_ID["010101"]["name"], "未济")
        self.assertEqual(GUA_BY_ID["111000"]["name"], "泰")
        self.assertEqual(GUA_BY_ID["000111"]["name"], "否")

    def test_yao_ci_index_alignment(self):
        kun = GUA_BY_ID["000000"]
        self.assertTrue(kun["yao_ci"][0].startswith("初六"))
        self.assertTrue(kun["yao_ci"][5].startswith("上六"))
        self.assertTrue(kun["yao_ci"][6].startswith("用六"))


class TestGrounding(unittest.TestCase):
    def test_qian_all_moving_includes_yao_ci_and_changed_kun(self):
        text = classics_grounding(fake_data("111111", moving={1, 2, 3, 4, 5, 6}))
        self.assertIn("本卦「乾」", text)
        self.assertIn("元亨，利贞", text)
        self.assertIn("潜龙，勿用", text)        # 初爻动爻爻辞
        self.assertIn("亢龙有悔", text)          # 上爻动爻爻辞
        self.assertIn("变卦「坤」", text)
        self.assertIn("地势坤", text)            # 坤大象
        self.assertIn("不得编造", text)           # 防幻觉指令

    def test_qian_first_line_moving_changes_to_gou(self):
        """回归用例:乾初爻动 → 姤(与 test_server 的服务端重算断言同源)。"""
        text = classics_grounding(fake_data("111111", moving={1}))
        self.assertIn("变卦「姤」", text)
        self.assertIn("初爻动爻爻辞：初九：潜龙，勿用。", text)

    def test_static_hexagram_has_no_changed_block(self):
        text = classics_grounding(fake_data("111111"))
        self.assertIn("六爻皆静", text)
        self.assertNotIn("变卦「", text)

    def test_grounding_degrades_to_empty_without_database(self):
        self.assertEqual(classics_grounding(fake_data("111111"), database={}), "")

    def test_unknown_hexagram_degrades_to_empty(self):
        self.assertEqual(classics_grounding(fake_data("111111"), database={}), "")
        self.assertEqual(classics_grounding({"lines": [], "movingLines": []}), "")

    def test_summary_shape_for_frontend(self):
        summary = classics_summary(fake_data("111111", moving={1, 2, 3, 4, 5, 6}))
        self.assertEqual(summary["primary"]["guaCi"], "乾：元亨，利贞。")
        self.assertEqual(summary["changed"]["daXiang"], "地势坤，君子以厚德载物。")
        self.assertIsNone(classics_summary({"lines": []}))


if __name__ == "__main__":
    unittest.main(verbosity=2)

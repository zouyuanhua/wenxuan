"""Independent rule and traditional-table checks; no JavaScript runtime required."""
import copy
import unittest

from hexagram import change_lines, classify_coins, describe_hexagram


def lines_from_bits(bits):
    return [{"yang": bool(bits & (1 << index)), "moving": False} for index in range(6)]


class HexagramTests(unittest.TestCase):
    def test_all_eight_coin_patterns_follow_the_given_rules(self):
        expected = [
            ("老阴", False, True, "×"),
            ("少阳", True, False, ""),
            ("少阴", False, False, ""),
            ("老阳", True, True, "○"),
        ]
        counts = {"老阴": 0, "少阳": 0, "少阴": 0, "老阳": 0}
        for mask in range(8):
            with self.subTest(mask=mask):
                coins = ["back" if mask & (1 << index) else "front" for index in range(3)]
                line = classify_coins(coins)
                back_count = coins.count("back")
                self.assertEqual((line["name"], line["yang"], line["moving"], line["marker"]), expected[back_count])
                self.assertIs(type(line["yang"]), bool)
                self.assertIs(type(line["moving"]), bool)
                self.assertEqual(line["backCount"], back_count)
                self.assertEqual(line["coins"], coins)
                self.assertIsNot(line["coins"], coins)
                counts[line["name"]] += 1
        self.assertEqual(counts, {"老阴": 1, "少阳": 3, "少阴": 3, "老阳": 1})

    def test_all_64_pairs_match_an_independently_indexed_traditional_grid(self):
        # Rows = lower trigram; columns = upper trigram. 周易速查表:
        # https://zh.wikisource.org/wiki/周易
        trigram_bits = [7, 3, 5, 1, 6, 2, 4, 0]
        trigram_names = ["乾", "兑", "离", "震", "巽", "坎", "艮", "坤"]
        trigram_natures = ["天", "泽", "火", "雷", "风", "水", "山", "地"]
        grid = [
            [1, 43, 14, 34, 9, 5, 26, 11],
            [10, 58, 38, 54, 61, 60, 41, 19],
            [13, 49, 30, 55, 37, 63, 22, 36],
            [25, 17, 21, 51, 42, 3, 27, 24],
            [44, 28, 50, 32, 57, 48, 18, 46],
            [6, 47, 64, 40, 59, 29, 4, 7],
            [33, 31, 56, 62, 53, 39, 52, 15],
            [12, 45, 35, 16, 20, 8, 23, 2],
        ]
        ordered_names = "乾 坤 屯 蒙 需 讼 师 比 小畜 履 泰 否 同人 大有 谦 豫 随 蛊 临 观 噬嗑 贲 剥 复 无妄 大畜 颐 大过 坎 离 咸 恒 遁 大壮 晋 明夷 家人 睽 蹇 解 损 益 夬 姤 萃 升 困 井 革 鼎 震 艮 渐 归妹 丰 旅 巽 兑 涣 节 中孚 小过 既济 未济".split()
        numbers, symbols = set(), set()
        for lower in range(8):
            for upper in range(8):
                with self.subTest(lower=lower, upper=upper):
                    result = describe_hexagram(lines_from_bits(trigram_bits[lower] | (trigram_bits[upper] << 3)))
                    number = grid[lower][upper]
                    self.assertEqual(result["number"], number)
                    self.assertEqual(result["name"], ordered_names[number - 1])
                    self.assertEqual(result["lower"], {"name": trigram_names[lower], "nature": trigram_natures[lower]})
                    self.assertEqual(result["upper"], {"name": trigram_names[upper], "nature": trigram_natures[upper]})
                    self.assertEqual(ord(result["symbol"]), 0x4DC0 + number - 1)
                    self.assertGreaterEqual(len(result["fullName"]), 3)
                    numbers.add(number)
                    symbols.add(result["symbol"])
        self.assertEqual(numbers, set(range(1, 65)))
        self.assertEqual(len(symbols), 64)

    def test_only_moving_lines_flip_without_mutating_original_metadata(self):
        patterns = [
            ["back", "back", "back"], ["front", "front", "front"],
            ["back", "back", "front"], ["back", "front", "front"],
            ["front", "back", "back"], ["front", "front", "back"],
        ]
        original = [classify_coins(coins) for coins in patterns]
        before = copy.deepcopy(original)
        changed = change_lines(original)
        self.assertEqual([line["yang"] for line in changed], [False, True, False, True, False, True])
        self.assertEqual(original, before)
        for source, destination in zip(original, changed):
            self.assertIsNot(source, destination)
            self.assertIsNot(source["coins"], destination["coins"])
            for key in ("coins", "name", "moving", "marker", "backCount"):
                self.assertEqual(destination[key], source[key])
        self.assertEqual([line["yang"] for line in change_lines(changed)], [line["yang"] for line in original])
        qian = [classify_coins(["back"] * 3) for _ in range(6)]
        self.assertEqual(describe_hexagram(qian)["fullName"], "乾为天")
        self.assertEqual(describe_hexagram(change_lines(qian))["fullName"], "坤为地")

    def test_bottom_to_top_orientation_and_returned_metadata_are_independent(self):
        for bits, name in [(0b000111, "地天泰"), (0b111000, "天地否"), (0b010001, "水雷屯"), (0b010101, "水火既济"), (0b101010, "火水未济")]:
            with self.subTest(bits=bits):
                self.assertEqual(describe_hexagram(lines_from_bits(bits))["fullName"], name)
        result = describe_hexagram(lines_from_bits(63))
        result["upper"]["name"] = "changed"
        self.assertEqual(describe_hexagram(lines_from_bits(63))["upper"]["name"], "乾")

    def test_invalid_input_and_python_truthiness_are_rejected(self):
        for coins in [None, [], "back", {}, ["back", "front"], ["back", "front", "字"], ["back", "front", True], ["back", "front", 1], ["back", "front", None]]:
            with self.subTest(coins=coins):
                with self.assertRaises((TypeError, ValueError)):
                    classify_coins(coins)
        for lines in [None, [], [None] * 6, [{"yang": 1}] * 6, [{"yang": "false"}] * 6, [{"yang": None}] * 6]:
            for function in (describe_hexagram, change_lines):
                with self.subTest(lines=lines, function=function.__name__):
                    with self.assertRaises((TypeError, ValueError)):
                        function(lines)


if __name__ == "__main__":
    unittest.main()

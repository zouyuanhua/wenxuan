# -*- coding: utf-8 -*-
"""追问循环(FR-05)校验测试。"""
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from followup import (  # noqa: E402
    FollowupError,
    MAX_FOLLOWUP_ROUNDS,
    validate_followup,
)


def history(count):
    return [{"question": f"追问{index}", "answer": f"解读{index}"}
            for index in range(1, count + 1)]


class TestFollowupValidation(unittest.TestCase):
    def test_missing_returns_none(self):
        self.assertIsNone(validate_followup(None))

    def test_empty_dict_is_malformed(self):
        with self.assertRaises(FollowupError):
            validate_followup({})

    def test_first_followup_normalized(self):
        result = validate_followup({"question": "  这份工作要不要换？  "})
        self.assertEqual(result, {"index": 1, "question": "这份工作要不要换？",
                                  "history": [], "initial": None})

    def test_initial_reading_is_carried_and_truncated(self):
        result = validate_followup({"question": "再问一句",
                                    "initial": {"question": "原问题", "answer": "甲" * 5000}})
        self.assertEqual(result["initial"]["question"], "原问题")
        self.assertEqual(len(result["initial"]["answer"]), 2200)

    def test_malformed_initial_is_ignored(self):
        for value in ("x", [], {"question": "", "answer": "答"}, {"question": "问"}):
            with self.subTest(value=value):
                result = validate_followup({"question": "问", "initial": value})
                self.assertIsNone(result["initial"])

    def test_history_entries_carry_round_index(self):
        result = validate_followup({"question": "第三次", "history": history(2)})
        self.assertEqual([item["index"] for item in result["history"]], [1, 2])

    def test_history_answer_is_truncated_for_context(self):
        result = validate_followup({"question": "问",
                                    "history": [{"question": "q", "answer": "乙" * 5000}]})
        self.assertEqual(len(result["history"][0]["answer"]), 2000)

    def test_third_followup_allowed_with_two_history_entries(self):
        result = validate_followup({"question": "还剩最后一次吗？", "history": history(2)})
        self.assertEqual(result["index"], 3)
        self.assertEqual(len(result["history"]), 2)

    def test_fourth_round_rejected_with_closing_message(self):
        with self.assertRaises(FollowupError) as caught:
            validate_followup({"question": "第四次", "history": history(3)})
        self.assertIn("此卦已尽", str(caught.exception))

    def test_index_mismatch_rejected(self):
        with self.assertRaises(FollowupError):
            validate_followup({"question": "问", "index": 2, "history": []})
        with self.assertRaises(FollowupError):
            validate_followup({"question": "问", "index": True, "history": []})

    def test_empty_question_rejected(self):
        for value in ("", "   \n ", None, 42, ["问"]):
            with self.assertRaises(FollowupError):
                validate_followup({"question": value})

    def test_overlong_question_rejected(self):
        with self.assertRaises(FollowupError):
            validate_followup({"question": "问" * 201})

    def test_malformed_payload_rejected(self):
        for value in ([], "追问", 3):
            with self.assertRaises(FollowupError):
                validate_followup(value)

    def test_malformed_history_entries_rejected(self):
        with self.assertRaises(FollowupError):
            validate_followup({"question": "问", "history": [{"question": "问"}]})
        with self.assertRaises(FollowupError):
            validate_followup({"question": "问", "history": ["不是字典"]})

    def test_rounds_constant_matches_srs(self):
        self.assertEqual(MAX_FOLLOWUP_ROUNDS, 3)


if __name__ == "__main__":
    unittest.main(verbosity=2)

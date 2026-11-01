"""UTF-8 prompt configuration, read on every request and replaced atomically."""

import json
import os
from pathlib import Path
import tempfile

MAX_PROMPT_LENGTH = 20000
MAX_CONFIG_BYTES = 128 * 1024


class PromptConfigError(Exception):
    """A configuration could not be read or persisted; keep disk details private."""


def validate_prompt(value):
    if type(value) is not str or not value.strip():
        raise ValueError("请输入提示词。")
    if len(value.encode("utf-16-le", "surrogatepass")) // 2 > MAX_PROMPT_LENGTH:
        raise ValueError("提示词不能超过20000个字符。")
    try:
        value.encode("utf-8")
    except UnicodeError:
        raise ValueError("提示词中含有无法读取的字符，请重新输入。") from None
    return value


class PromptStore:
    def __init__(self, file_path):
        self.path = Path(file_path)

    def _load(self):
        try:
            with self.path.open("rb") as source:
                raw = source.read(MAX_CONFIG_BYTES + 1)
            if len(raw) > MAX_CONFIG_BYTES:
                raise ValueError("Configuration is too large")
            data = json.loads(raw.decode("utf-8-sig"))
            if not isinstance(data, dict):
                raise ValueError("Invalid configuration")
            return data
        except (OSError, ValueError, UnicodeError, RecursionError):
            raise PromptConfigError("无法读取提示词配置，请在配置页面重新保存。") from None

    def read(self):
        try:
            return validate_prompt(self._load().get("system_prompt"))
        except (ValueError, UnicodeError, RecursionError):
            raise PromptConfigError("无法读取提示词配置，请在配置页面重新保存。") from None

    def read_guard(self, default_prompt):
        """守门提示词缺失或配置损坏时使用内置默认值,不阻断解卦。"""
        try:
            value = self._load().get("guard_prompt")
            return validate_prompt(value) if value is not None else default_prompt
        except (PromptConfigError, ValueError):
            return default_prompt

    def _load_for_write(self):
        """文件不存在时可以创建;文件存在但损坏时必须拒绝覆盖。"""
        if not self.path.exists():
            return {}
        return self._load()

    def write(self, value):
        value = validate_prompt(value)
        # 配置损坏时沿用上游行为:拒绝写入并保留原文件,不静默覆盖。
        guard = self._load_for_write().get("guard_prompt")
        payload = {"system_prompt": value}
        if type(guard) is str and guard.strip():
            payload["guard_prompt"] = guard
        self._write_payload(payload)
        return value

    def write_guard(self, value):
        value = validate_prompt(value)
        payload = {"system_prompt": self.read(), "guard_prompt": value}
        self._write_payload(payload)
        return value

    def _write_payload(self, payload):
        temporary_path = None
        try:
            self.path.parent.mkdir(parents=True, exist_ok=True)
            with tempfile.NamedTemporaryFile(mode="w", encoding="utf-8", newline="\n",
                                             dir=self.path.parent, prefix=".prompt-",
                                             suffix=".tmp", delete=False) as target:
                temporary_path = Path(target.name)
                json.dump(payload, target, ensure_ascii=False, indent=2)
                target.write("\n")
                target.flush()
                os.fsync(target.fileno())
            os.replace(temporary_path, self.path)
            temporary_path = None
        except (OSError, UnicodeError):
            raise PromptConfigError("提示词保存失败，请检查配置目录是否可写后重试。") from None
        finally:
            if temporary_path is not None:
                try:
                    temporary_path.unlink(missing_ok=True)
                except OSError:
                    pass

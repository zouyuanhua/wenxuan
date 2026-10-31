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

    def read(self):
        try:
            with self.path.open("rb") as source:
                raw = source.read(MAX_CONFIG_BYTES + 1)
            if len(raw) > MAX_CONFIG_BYTES:
                raise ValueError("Configuration is too large")
            data = json.loads(raw.decode("utf-8-sig"))
            if not isinstance(data, dict):
                raise ValueError("Invalid configuration")
            return validate_prompt(data.get("system_prompt"))
        except (OSError, ValueError, UnicodeError, RecursionError):
            raise PromptConfigError("无法读取提示词配置，请在配置页面重新保存。") from None

    def write(self, value):
        value = validate_prompt(value)
        temporary_path = None
        try:
            self.path.parent.mkdir(parents=True, exist_ok=True)
            with tempfile.NamedTemporaryFile(mode="w", encoding="utf-8", newline="\n",
                                             dir=self.path.parent, prefix=".prompt-",
                                             suffix=".tmp", delete=False) as target:
                temporary_path = Path(target.name)
                json.dump({"system_prompt": value}, target, ensure_ascii=False, indent=2)
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
        return value

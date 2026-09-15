import re

_EXTENSION = re.compile(r"(?:доб\.?|добавочный|ext\.?|#)\s*(\d{1,6})\s*$", re.IGNORECASE)
_ALLOWED = re.compile(r"^[\d\s()+\-.]+$")

PHONE_HINT = "Укажите номер в формате +7 912 345-67-89, добавочный — через «доб.», или внутренний номер из 3–6 цифр"


def normalize_phone(value: str) -> str:
    """Возвращает номер в едином виде или бросает ValueError с понятным сообщением."""
    raw = (value or "").strip()
    if not raw:
        raise ValueError("Укажите телефон для связи")

    extension = None
    match = _EXTENSION.search(raw)
    if match:
        extension = match.group(1)
        raw = raw[: match.start()].strip().rstrip(",;")

    if not raw or not _ALLOWED.match(raw):
        raise ValueError(PHONE_HINT)
    digits = re.sub(r"\D", "", raw)

    if extension is None and 3 <= len(digits) <= 6 and "+" not in raw:
        return f"внутр. {digits}"

    if len(digits) == 11 and digits[0] in "78":
        digits = digits[1:]
    if len(digits) != 10 or digits[0] == "0" or len(set(digits)) == 1:
        raise ValueError(PHONE_HINT)

    formatted = f"+7 ({digits[:3]}) {digits[3:6]}-{digits[6:8]}-{digits[8:]}"
    return f"{formatted} доб. {extension}" if extension else formatted

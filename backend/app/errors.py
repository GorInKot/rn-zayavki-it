class AppError(Exception):
    """Ошибка предметной области с сообщением, которое можно показать пользователю."""

    def __init__(self, status_code: int, message: str, errors: list[dict] | None = None, code: str | None = None):
        super().__init__(message)
        self.status_code = status_code
        self.message = message
        self.errors = errors or []
        self.code = code


def not_found(what: str = "Заявка не найдена") -> AppError:
    return AppError(404, what, code="not_found")


def forbidden(message: str = "Недостаточно прав для этого действия") -> AppError:
    return AppError(403, message, code="forbidden")


def conflict_stale() -> AppError:
    return AppError(
        409,
        "Заявку только что изменил другой пользователь. Обновите страницу, чтобы увидеть актуальные данные, и повторите действие.",
        code="stale_version",
    )


def field_error(path: str, message: str, status_code: int = 422) -> AppError:
    return AppError(status_code, "Проверьте заполнение формы", errors=[{"path": path, "message": message}], code="validation")

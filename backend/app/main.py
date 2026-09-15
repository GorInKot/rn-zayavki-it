import logging

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from app.api import admin, documents, drafts, meta, notifications, requests
from app.config import get_settings
from app.errors import AppError

logger = logging.getLogger("zayavki")
settings = get_settings()

CSRF_HEADER = "X-Requested-With"
CSRF_VALUE = "zayavki"
UNSAFE_METHODS = {"POST", "PUT", "PATCH", "DELETE"}

app = FastAPI(
    title="Система заявок на автоматизацию",
    docs_url=None if settings.environment == "production" else "/api/docs",
    redoc_url=None,
    openapi_url=None if settings.environment == "production" else "/api/openapi.json",
)


def _error_message(error: dict) -> str:
    kind = error.get("type", "")
    ctx = error.get("ctx") or {}
    messages = {
        "missing": "Заполните поле",
        "string_too_short": "Заполните поле",
        "string_too_long": f"Не более {ctx.get('max_length')} символов",
        "too_long": f"Не более {ctx.get('max_length')} элементов",
        "greater_than": f"Значение должно быть больше {ctx.get('gt')}",
        "greater_than_equal": f"Значение должно быть не меньше {ctx.get('ge')}",
        "less_than": f"Значение должно быть меньше {ctx.get('lt')}",
        "less_than_equal": f"Значение должно быть не больше {ctx.get('le')}",
        "int_parsing": "Введите целое число",
        "int_from_float": "Введите целое число",
        "int_type": "Введите целое число",
        "decimal_parsing": "Введите число",
        "decimal_type": "Введите число",
        "decimal_max_places": f"Не больше {ctx.get('decimal_places')} знаков после запятой",
        "decimal_max_digits": "Слишком большое число",
        "enum": "Выберите значение из списка",
        "literal_error": "Выберите значение из списка",
        "bool_parsing": "Некорректное значение",
        "uuid_parsing": "Некорректный идентификатор",
        "date_parsing": "Укажите дату",
        "date_from_datetime_parsing": "Укажите дату",
        "extra_forbidden": "Неизвестное поле",
        "model_type": "Некорректные данные",
        "dict_type": "Некорректные данные",
        "list_type": "Некорректные данные",
    }
    if kind == "value_error":
        return str(ctx.get("error") or error.get("msg", "Некорректное значение"))
    return messages.get(kind, "Некорректное значение")


@app.exception_handler(AppError)
async def app_error_handler(_: Request, exc: AppError) -> JSONResponse:
    return JSONResponse(status_code=exc.status_code, content={"message": exc.message, "code": exc.code, "errors": exc.errors})


@app.exception_handler(RequestValidationError)
async def validation_error_handler(_: Request, exc: RequestValidationError) -> JSONResponse:
    errors = []
    for error in exc.errors():
        location = [str(part) for part in error.get("loc", ()) if part not in ("body", "query", "path")]
        errors.append({"path": ".".join(location), "message": _error_message(error)})
    return JSONResponse(status_code=422, content={"message": "Проверьте заполнение формы", "code": "validation", "errors": errors})


@app.exception_handler(Exception)
async def unexpected_error_handler(_: Request, exc: Exception) -> JSONResponse:
    logger.exception("Необработанная ошибка", exc_info=exc)
    return JSONResponse(
        status_code=500,
        content={"message": "Внутренняя ошибка сервера. Повторите действие; если ошибка повторится, сообщите в поддержку.", "code": "internal", "errors": []},
    )


@app.middleware("http")
async def security_middleware(request: Request, call_next):
    # Портал может передавать личность через cookie — тогда форма на чужом сайте смогла бы отправить запрос
    # от имени сотрудника. Нестандартный заголовок нельзя выставить без CORS, а CORS мы не разрешаем.
    if request.method in UNSAFE_METHODS and request.url.path.startswith("/api/") and request.headers.get(CSRF_HEADER) != CSRF_VALUE:
        return JSONResponse(status_code=403, content={"message": "Запрос отклонён: отсутствует защитный заголовок.", "code": "csrf", "errors": []})
    response = await call_next(request)
    frame_ancestors = " ".join(["'self'", *settings.portal_origins_list])
    response.headers.setdefault("Content-Security-Policy", f"frame-ancestors {frame_ancestors}")
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("Referrer-Policy", "same-origin")
    if request.url.path.startswith("/api/"):
        response.headers.setdefault("Cache-Control", "no-store")
    return response


for router in (meta.router, requests.router, drafts.router, documents.router, notifications.router, admin.router):
    app.include_router(router, prefix="/api")

from contextlib import asynccontextmanager
from typing import AsyncIterator

import structlog
from fastapi import FastAPI
from fastapi.responses import JSONResponse, Response

from app.api.director import router as director_router
from app.api.health import router as health_router
from app.api.research import router as research_router
from app.config import get_settings
from app.logging_config import setup_logging
from app.metrics import metrics_output

logger = structlog.get_logger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    # Fail fast: raises ValidationError if required env vars are missing
    settings = get_settings()

    setup_logging(env=settings.APP_ENV, version=settings.APP_VERSION)

    # Bind service-level fields to every log record (task rule #4)
    structlog.contextvars.bind_contextvars(
        service="ai-backend",
        env=settings.APP_ENV,
        version=settings.APP_VERSION,
    )

    logger.info("startup", event="startup")
    yield
    logger.info("shutdown", event="shutdown")


def create_app() -> FastAPI:
    settings = get_settings()

    # OpenAPI docs disabled in production (task rule #6)
    docs_url = "/docs" if settings.APP_ENV != "prod" else None
    openapi_url = "/openapi.json" if settings.APP_ENV != "prod" else None

    app = FastAPI(
        title="AI Video Factory — AI Backend",
        version=settings.APP_VERSION,
        lifespan=lifespan,
        docs_url=docs_url,
        openapi_url=openapi_url,
    )

    app.include_router(health_router)
    app.include_router(research_router)
    app.include_router(director_router)

    @app.get("/metrics", include_in_schema=False)
    async def metrics() -> Response:
        body, content_type = metrics_output()
        return Response(content=body, media_type=content_type)

    @app.exception_handler(Exception)
    async def unhandled_exception_handler(request, exc: Exception) -> JSONResponse:
        logger.error("unhandled_exception", error=str(exc), path=str(request.url))
        return JSONResponse(status_code=500, content={"detail": "Internal server error"})

    return app


app = create_app()

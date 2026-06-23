from fastapi import APIRouter
from pydantic import BaseModel

from app.config import get_settings

router = APIRouter()


class HealthResponse(BaseModel):
    status: str
    version: str


@router.get("/health", response_model=HealthResponse)
async def health() -> HealthResponse:
    """Health-check endpoint. Returns 200 when the service is running."""
    settings = get_settings()
    return HealthResponse(status="ok", version=settings.APP_VERSION)

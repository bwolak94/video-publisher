"""VideoStoryboard Pydantic v2 models.

Mirrors the JSON Schema defined in PRD Section 5.1.
"""
import uuid
from typing import Annotated, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field


class TextOverlay(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    text: str
    style: Literal["standard", "punchy", "funny_sub"]
    position: Literal["top", "center", "bottom"] = "bottom"


class Scene(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    sceneId: str = Field(default_factory=lambda: str(uuid.uuid4()))
    sequenceNumber: int = Field(ge=1)
    # durationInSeconds is optional in the schema (not in required[])
    durationInSeconds: Optional[Annotated[float, Field(ge=1)]] = None
    narrationText: str
    audioUrl: Optional[str] = None
    audioCacheKey: Optional[str] = None
    visualPrompt: str
    videoUrl: Optional[str] = None
    visualCacheKey: Optional[str] = None
    isDirty: bool = False
    textOverlay: Optional[TextOverlay] = None


class StoryboardMeta(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    title: str = Field(max_length=100)
    description: Optional[str] = Field(None, max_length=5000)
    # max_length on a list constrains item count in Pydantic v2
    tags: Optional[list[str]] = Field(None, max_length=15)
    aspectRatio: Literal["16:9", "9:16"]
    language: Literal["pl", "en", "de", "fr", "es"]
    voiceId: str
    toneProfile: Optional[Literal["informative", "comedic", "edgy", "educational"]] = None


class VideoStoryboard(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    meta: StoryboardMeta
    # min_length=1 enforces PRD: "minItems": 1
    timeline: list[Scene] = Field(min_length=1)

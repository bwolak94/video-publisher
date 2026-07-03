"""VideoStoryboard Pydantic v2 models.

Mirrors the JSON Schema defined in PRD Section 5.1.
"""
import uuid
from typing import Annotated, Literal

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
    durationInSeconds: Annotated[float, Field(ge=1)] | None = None
    narrationText: str
    audioUrl: str | None = None
    audioCacheKey: str | None = None
    visualPrompt: str
    videoUrl: str | None = None
    visualCacheKey: str | None = None
    isDirty: bool = False
    textOverlay: TextOverlay | None = None


class StoryboardMeta(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    title: str = Field(max_length=100)
    description: str | None = Field(None, max_length=5000)
    # max_length on a list constrains item count in Pydantic v2
    tags: list[str] | None = Field(None, max_length=15)
    aspectRatio: Literal["16:9", "9:16"]
    language: Literal["pl", "en", "de", "fr", "es"]
    voiceId: str
    toneProfile: Literal["informative", "comedic", "edgy", "educational"] | None = None


class VideoStoryboard(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    meta: StoryboardMeta
    # min_length=1 enforces PRD: "minItems": 1
    timeline: list[Scene] = Field(min_length=1)

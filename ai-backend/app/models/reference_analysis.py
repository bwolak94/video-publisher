"""Pydantic v2 models for FEATURE-06 — Reference Video Analysis."""
from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, Field


class AudioAnalysis(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    hasMusic: bool = False
    hasSpeech: bool = True
    avgLoudnessLUFS: float = -23.0


class ReferenceAnalysisBrief(BaseModel):
    """Structured analysis of a reference video.

    Injected into Director Agent context so the generated storyboard
    is inspired by (not copied from) the reference.
    """
    model_config = ConfigDict(populate_by_name=True)

    sourceUrl: str
    totalDurationSeconds: float
    sceneCount: int
    avgSceneDurationSeconds: float
    pacing: Literal["slow", "medium", "fast", "dynamic"]
    toneProfile: Literal["serious", "comedic", "inspirational", "educational", "dramatic"]
    structurePattern: str              # e.g. "hook → problem → solution → cta"
    transcript: str = ""              # full transcript text (may be empty if transcription failed)
    keyTopics: list[str] = Field(default_factory=list)
    visualStyle: str = ""             # e.g. "talking head with b-roll cutaways"
    audioAnalysis: AudioAnalysis = Field(default_factory=AudioAnalysis)
    analyzedAt: Optional[str] = None

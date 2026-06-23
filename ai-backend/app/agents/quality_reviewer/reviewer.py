"""QualityReviewer — deterministic gate before asset generation.

PRD Section 3.3. Pure function: no LLM, no HTTP, no Redis.
All six checks run regardless of earlier failures (task rule #2).
APPROVED only when zero non-WARN checks fail (task rule #3).
"""
import structlog

from app.models.director import NicheProfile
from app.models.review import ReviewResult
from app.models.storyboard import VideoStoryboard

logger = structlog.get_logger(__name__)

# ── Constants ──────────────────────────────────────────────────────────────────

_CTA_KEYWORDS: list[str] = [
    "subscribe", "follow", "comment", "like", "check out", "link in bio",
]

# task rule #6: static keyword list, case-insensitive
_PLACEHOLDER_KEYWORDS: list[str] = [
    "tbd", "[add", "placeholder", "insert", "todo",
]

# Tone keyword lists for QC-04 heuristic (WARN only)
_TONE_KEYWORDS: dict[str, list[str]] = {
    "informative": ["according", "research", "data", "study", "expert", "report", "analysis"],
    "comedic": ["funny", "hilarious", "crazy", "wild", "joke", "laugh", "lol"],
    "edgy": ["shocking", "controversial", "banned", "exposed", "secret", "truth", "dark"],
    "educational": ["learn", "understand", "explain", "lesson", "key", "important", "step"],
}

_TONE_KEYWORD_DENSITY_THRESHOLD = 0.02  # 1 keyword per 50 words


class QualityReviewer:
    """Deterministic quality gate for VideoStoryboard validation.

    Usage::

        result = QualityReviewer().review(storyboard, niche_profile)
        if result.status == "REJECTED":
            # pass result.constraints to retry loop (TASK-05)
    """

    def review(
        self,
        storyboard: VideoStoryboard,
        niche_profile: NicheProfile,
    ) -> ReviewResult:
        """Run all six quality checks and return a ReviewResult.

        All checks run even if an earlier check failed (collect-all strategy).
        """
        constraints: list[str] = []
        warnings: list[str] = []

        self._qc01_schema(storyboard, constraints)
        # Remaining checks require a non-empty timeline — skip if QC-01 already failed
        if storyboard.timeline:
            self._qc02_scene_count(storyboard, niche_profile, constraints)
            self._qc03_cta_presence(storyboard, constraints)
            self._qc04_tone_compliance(storyboard, niche_profile, warnings)
            self._qc05_duration_estimate(storyboard, niche_profile, constraints)
            self._qc06_visual_prompt_quality(storyboard, constraints)

        status = "APPROVED" if not constraints else "REJECTED"

        if status == "APPROVED" and warnings:
            logger.warning(
                "quality_review_approved_with_warnings",
                channel_warnings=warnings,
            )

        logger.info(
            "quality_review_complete",
            status=status,
            constraint_count=len(constraints),
            warning_count=len(warnings),
        )
        return ReviewResult(status=status, constraints=constraints, warnings=warnings)

    # ── QC-01: Schema validation ───────────────────────────────────────────────

    @staticmethod
    def _qc01_schema(storyboard: VideoStoryboard, constraints: list[str]) -> None:
        """Verify the timeline is non-empty (Pydantic already enforces this, but re-check)."""
        if not storyboard.timeline:
            constraints.append("Schema error: timeline — must contain at least one scene.")

    # ── QC-02: Scene count ─────────────────────────────────────────────────────

    @staticmethod
    def _qc02_scene_count(
        storyboard: VideoStoryboard,
        niche_profile: NicheProfile,
        constraints: list[str],
    ) -> None:
        actual = len(storyboard.timeline)
        target = niche_profile.targetSceneCount
        if abs(actual - target) > 1:
            constraints.append(
                f"Scene count must be {target}±1. Got {actual}."
            )

    # ── QC-03: CTA presence ───────────────────────────────────────────────────

    @staticmethod
    def _qc03_cta_presence(storyboard: VideoStoryboard, constraints: list[str]) -> None:
        last = storyboard.timeline[-1]
        combined = last.narrationText.lower()
        if last.textOverlay:
            combined += " " + last.textOverlay.text.lower()

        if not any(kw in combined for kw in _CTA_KEYWORDS):
            constraints.append("Last scene must include a call-to-action.")

    # ── QC-04: Tone compliance (WARN only — never blocks) ─────────────────────

    @staticmethod
    def _qc04_tone_compliance(
        storyboard: VideoStoryboard,
        niche_profile: NicheProfile,
        warnings: list[str],
    ) -> None:
        tone = (storyboard.meta.toneProfile or niche_profile.tone).lower()
        tone_words = _TONE_KEYWORDS.get(tone, [])
        if not tone_words:
            return

        all_narration = " ".join(s.narrationText.lower() for s in storyboard.timeline)
        total_words = len(all_narration.split())
        if total_words == 0:
            return

        matched = sum(1 for kw in tone_words if kw in all_narration)
        density = matched / total_words

        if density < _TONE_KEYWORD_DENSITY_THRESHOLD:
            msg = (
                f"Tone compliance warning: expected '{tone}' tone keywords "
                f"(density {density:.3f} < {_TONE_KEYWORD_DENSITY_THRESHOLD})."
            )
            logger.warning("qc04_tone_mismatch", tone=tone, density=density)
            warnings.append(msg)

    # ── QC-05: Duration estimate ───────────────────────────────────────────────

    @staticmethod
    def _qc05_duration_estimate(
        storyboard: VideoStoryboard,
        niche_profile: NicheProfile,
        constraints: list[str],
    ) -> None:
        actual_s = sum((s.durationInSeconds or 0.0) for s in storyboard.timeline)
        target_s = niche_profile.targetDurationSeconds
        margin = target_s * 0.15
        min_s = target_s - margin
        max_s = target_s + margin

        if not (min_s <= actual_s <= max_s):
            constraints.append(
                f"Total duration must be {min_s:.0f}–{max_s:.0f}s. Got {actual_s:.0f}s."
            )

    # ── QC-06: Visual prompt quality ──────────────────────────────────────────

    @staticmethod
    def _qc06_visual_prompt_quality(
        storyboard: VideoStoryboard,
        constraints: list[str],
    ) -> None:
        for scene in storyboard.timeline:
            prompt_lower = scene.visualPrompt.lower()
            word_count = len(scene.visualPrompt.split())
            has_placeholder = any(kw in prompt_lower for kw in _PLACEHOLDER_KEYWORDS)

            if word_count < 10 or has_placeholder:
                constraints.append(
                    f"Scene {scene.sequenceNumber} visualPrompt too short or contains placeholder text."
                )

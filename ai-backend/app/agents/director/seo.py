"""SEO helpers for the Director Agent.

PRD task rule #5: for videos with durationInSeconds sum > 120 seconds,
the description MUST include YouTube chapter timestamps in format:
  00:00 - Chapter Title
"""


def generate_timestamps(scenes: list[dict]) -> str:
    """Return YouTube chapter timestamp string for a list of scene dicts."""
    lines: list[str] = []
    current_seconds = 0

    for scene in scenes:
        minutes = current_seconds // 60
        seconds = current_seconds % 60
        title = scene.get("title") or f"Scene {scene.get('sequenceNumber', '?')}"
        lines.append(f"{minutes:02d}:{seconds:02d} - {title}")
        current_seconds += int(scene.get("durationInSeconds") or 0)

    return "\n".join(lines)


def append_timestamps_to_description(
    description: str,
    scenes: list[dict],
    total_duration: float,
) -> str:
    """If total_duration > 120s, append chapter timestamps to description."""
    if total_duration <= 120:
        return description
    timestamps = generate_timestamps(scenes)
    if description:
        return f"{description}\n\n{timestamps}"
    return timestamps

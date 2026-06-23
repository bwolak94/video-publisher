"""Unit tests for SEO timestamp generator — UT-03-05."""
from app.agents.director.seo import append_timestamps_to_description, generate_timestamps


# ─── UT-03-05: 8-scene storyboard > 120s → description has timestamps ─────────

def _make_scenes(count: int, duration_each: int = 30) -> list[dict]:
    return [
        {"sequenceNumber": i + 1, "title": f"Scene {i + 1}", "durationInSeconds": duration_each}
        for i in range(count)
    ]


def test_generate_timestamps_8_scenes():
    """UT-03-05: 8-scene storyboard produces timestamp string with 00:00 markers."""
    scenes = _make_scenes(8, duration_each=30)
    result = generate_timestamps(scenes)

    lines = result.strip().split("\n")
    assert len(lines) == 8
    # First scene always starts at 00:00
    assert lines[0].startswith("00:00 - ")
    # All lines match format MM:SS - Title
    for line in lines:
        assert " - " in line
        ts, _title = line.split(" - ", 1)
        minutes, seconds = ts.split(":")
        assert minutes.isdigit()
        assert seconds.isdigit()


def test_generate_timestamps_accumulates_correctly():
    """Timestamps advance by durationInSeconds of each preceding scene."""
    scenes = [
        {"sequenceNumber": 1, "title": "Intro", "durationInSeconds": 60},
        {"sequenceNumber": 2, "title": "Main", "durationInSeconds": 120},
        {"sequenceNumber": 3, "title": "Outro", "durationInSeconds": 30},
    ]
    result = generate_timestamps(scenes)
    lines = result.split("\n")

    assert lines[0].startswith("00:00 - Intro")
    assert lines[1].startswith("01:00 - Main")   # 60s = 1 min
    assert lines[2].startswith("03:00 - Outro")  # 60+120=180s = 3 min


def test_append_timestamps_over_120s():
    """UT-03-05: description appended with timestamps when total > 120s."""
    scenes = _make_scenes(8, duration_each=30)  # 240s total
    total_duration = sum(s["durationInSeconds"] for s in scenes)

    result = append_timestamps_to_description(
        description="A great video about AI.",
        scenes=scenes,
        total_duration=total_duration,
    )

    assert "A great video about AI." in result
    assert "00:00 - " in result


def test_append_timestamps_skipped_under_120s():
    """For total <= 120s (Shorts), description is unchanged."""
    scenes = _make_scenes(4, duration_each=20)  # 80s total
    total_duration = sum(s["durationInSeconds"] for s in scenes)
    description = "Short video description."

    result = append_timestamps_to_description(
        description=description,
        scenes=scenes,
        total_duration=total_duration,
    )

    assert result == description
    assert "00:00" not in result

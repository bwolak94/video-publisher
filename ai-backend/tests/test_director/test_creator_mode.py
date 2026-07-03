"""Unit + integration tests for Director Creator Mode (LangGraph) — UT-03-07, IT-03-03, IT-03-04."""
import json
from unittest.mock import AsyncMock, patch

from app.agents.director.creator_mode import build_creator_graph, get_creator_graph
from app.models.director import NicheProfile
from app.models.storyboard import VideoStoryboard

# ── Helpers ────────────────────────────────────────────────────────────────────

def _initial_state(topic: str = "The fall of Silicon Valley Bank") -> dict:
    return {
        "topic": topic,
        "niche_profile": NicheProfile().model_dump(),
        "scene_count": 6,
        "target_duration_seconds": 600,
        "aspect_ratio": "16:9",
        "outline": None,
        "outline_approved": False,
        "storyboard": None,
        "error": None,
    }


_MOCK_OUTLINE = json.dumps([
    {"sequenceNumber": 1, "title": "Introduction", "keyPoint": "SVB collapsed in 2023"},
    {"sequenceNumber": 2, "title": "The Cause", "keyPoint": "Bank run triggered by bond losses"},
    {"sequenceNumber": 3, "title": "The Fallout", "keyPoint": "Ripple effects across tech startups"},
    {"sequenceNumber": 4, "title": "Government Response", "keyPoint": "FDIC takeover and bailout debate"},
    {"sequenceNumber": 5, "title": "Lessons Learned", "keyPoint": "Risk management and diversification"},
])

_MOCK_STORYBOARD_JSON = json.dumps({
    "meta": {
        "title": "How SVB Collapsed in 48 Hours",
        "aspectRatio": "16:9",
        "language": "en",
        "voiceId": "voice-001",
        "description": "The full story of Silicon Valley Bank's collapse.",
    },
    "timeline": [
        {
            "sequenceNumber": i + 1,
            "narrationText": f"SVB collapse narration for scene {i + 1}.",
            "visualPrompt": f"Dramatic financial imagery showing bank collapse in scene {i + 1} with detail.",
            "durationInSeconds": 100,
        }
        for i in range(6)
    ],
})


# ─── UT-03-07: LangGraph Creator Mode graph has `human_approval` node ─────────

def test_creator_graph_has_human_approval_node():
    """UT-03-07: build_creator_graph() produces a graph with 'human_approval' node."""
    graph = build_creator_graph()
    assert "human_approval" in graph.nodes


async def test_creator_graph_compiled_with_interrupt():
    """UT-03-07 (compiled): get_creator_graph() compiles with interrupt_before human_approval."""
    compiled = await get_creator_graph()
    # interrupt_before_nodes is the public attribute on CompiledStateGraph
    assert "human_approval" in compiled.interrupt_before_nodes


# ─── IT-03-03: Outline node runs; graph suspends at human_approval ────────────

async def test_creator_mode_suspends_at_human_approval():
    """IT-03-03: Graph generates outline, then suspends at human_approval node."""
    graph = await get_creator_graph()
    config = {"configurable": {"thread_id": "thread-it-03-03"}}

    with patch(
        "app.agents.director.creator_mode._call_llm_mini",
        new=AsyncMock(return_value=_MOCK_OUTLINE),
    ):
        await graph.ainvoke(_initial_state(), config=config)

    # Graph should be interrupted — next node is human_approval
    snapshot = await graph.aget_state(config)
    assert "human_approval" in snapshot.next

    # Outline was populated by the outline node
    assert snapshot.values.get("outline") is not None
    assert len(snapshot.values["outline"]) > 0


# ─── IT-03-04: After human approval, graph resumes and produces storyboard ────

async def test_creator_mode_resumes_after_approval():
    """IT-03-04: After aupdate_state(approved=True), graph produces VideoStoryboard."""
    graph = await get_creator_graph()
    config = {"configurable": {"thread_id": "thread-it-03-04"}}

    # Stage 1: run until interrupt
    with patch(
        "app.agents.director.creator_mode._call_llm_mini",
        new=AsyncMock(return_value=_MOCK_OUTLINE),
    ):
        await graph.ainvoke(_initial_state(), config=config)

    # Human approves the outline
    await graph.aupdate_state(config, {"outline_approved": True})

    # Stage 2: resume
    with patch(
        "app.agents.director.creator_mode._call_llm_full",
        new=AsyncMock(return_value=_MOCK_STORYBOARD_JSON),
    ):
        final_state = await graph.ainvoke(None, config=config)

    assert final_state["storyboard"] is not None
    assert final_state["error"] is None

    # Must be a schema-valid VideoStoryboard
    storyboard = VideoStoryboard.model_validate(final_state["storyboard"])
    assert storyboard.meta.title == "How SVB Collapsed in 48 Hours"
    assert len(storyboard.timeline) == 6


async def test_creator_mode_skips_storyboard_if_not_approved():
    """If outline_approved stays False, generate_storyboard node is not reached."""
    graph = await get_creator_graph()
    config = {"configurable": {"thread_id": "thread-it-03-04b"}}

    with patch(
        "app.agents.director.creator_mode._call_llm_mini",
        new=AsyncMock(return_value=_MOCK_OUTLINE),
    ):
        await graph.ainvoke(_initial_state(), config=config)

    # Do NOT approve — resume without updating state
    final_state = await graph.ainvoke(None, config=config)

    assert final_state["storyboard"] is None
    assert final_state["outline_approved"] is False

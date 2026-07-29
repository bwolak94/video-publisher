"""Director Agent — Creator Mode (LangGraph with human-in-the-loop).

Graph structure:
  outline ──→ human_approval* ──→ generate_storyboard ──→ END
                   └──────────────────────────────────────→ END (not approved)

* interrupt_before=["human_approval"] — graph suspends here so the frontend
  can present the outline for user review and editing.

After the user approves (or edits), the caller:
  1. Calls graph.aupdate_state(config, {"outline_approved": True})
  2. Resumes with graph.ainvoke(None, config)
"""
import asyncio
import json
from typing import Any

import asyncpg
import openai
import pydantic
import structlog
from langgraph.checkpoint.redis.aio import AsyncRedisSaver
from langgraph.graph import END, StateGraph
from openai import AsyncOpenAI
from typing_extensions import TypedDict

from app.agents.director.prompts import build_full_storyboard_messages, build_outline_messages
from app.config import get_settings
from app.models.director import NicheProfile
from app.models.storyboard import VideoStoryboard
from app.utils.text import strip_fences

logger = structlog.get_logger(__name__)

# I2: Module-level singleton — reuses the connection pool across all calls.
_openai_client: AsyncOpenAI | None = None


def _get_client() -> AsyncOpenAI:
    global _openai_client
    if _openai_client is None:
        _openai_client = AsyncOpenAI()
    return _openai_client


# ── Graph State ────────────────────────────────────────────────────────────────

class DirectorState(TypedDict):
    topic: str
    niche_profile: dict[str, Any]
    scene_count: int
    target_duration_seconds: int
    aspect_ratio: str
    project_id: str | None           # used for RAG retrieval if source material was ingested
    outline: list[dict[str, Any]] | None
    outline_approved: bool
    storyboard: dict[str, Any] | None
    error: str | None
    # I4: RAG chunks fetched once in outline_node and passed through — avoids a
    # duplicate DB round-trip in generate_storyboard_node for the same query.
    _source_chunks: list[str] | None


# ── LLM helpers (thin wrappers — easy to mock in tests) ───────────────────────

async def _call_llm_mini(system: str, user: str) -> str:
    """Call GPT-4o-mini for outline generation (cheap model, task rule #1).

    F1: Accepts a separate system message so the static schema prefix is
    eligible for OpenAI prompt caching (requires >=1024 tokens in prefix).
    response_format=json_object guarantees parseable JSON without fence-stripping.
    """
    resp = await _get_client().chat.completions.create(
        model="gpt-4o-mini",
        messages=[
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
        temperature=0.7,
        response_format={"type": "json_object"},
    )
    return resp.choices[0].message.content or ""


async def _call_llm_full(system: str, user: str) -> str:
    """Call GPT-4o for full storyboard generation (expensive model, task rule #1).

    F1: Static schema + niche profile in system message → cached prefix.
    Dynamic outline + context in user message → changes per call.
    response_format=json_object guarantees parseable JSON without fence-stripping.
    """
    resp = await _get_client().chat.completions.create(
        model="gpt-4o",
        messages=[
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
        temperature=0.7,
        response_format={"type": "json_object"},
    )
    return resp.choices[0].message.content or ""


# Public aliases for callers outside this module (e.g. creator.py API layer).
call_llm_mini = _call_llm_mini
call_llm_full = _call_llm_full


# ── Graph Nodes ────────────────────────────────────────────────────────────────

async def _retrieve_rag_context(project_id: str | None, query: str) -> list[str]:
    """Retrieve relevant source chunks if project has ingested material.

    RAG is optional — database or network failures degrade gracefully to an
    empty context list rather than aborting outline generation.
    """
    if not project_id:
        return []
    try:
        from app.rag.db import get_pool
        from app.rag.ingestion import retrieve_context
        pool = await get_pool()
        return await retrieve_context(pool, project_id, query)
    except (asyncpg.PostgresError, OSError) as exc:
        logger.warning("rag_retrieval_failed", error=str(exc))
        return []


async def outline_node(state: DirectorState) -> dict[str, Any]:
    """Stage 1: generate a 5-point outline using the cheap model."""
    profile = NicheProfile.model_validate(state["niche_profile"])

    # I4: Fetch RAG context once here and store in state so generate_storyboard_node
    # can reuse it without a second DB query for the same project + topic.
    source_chunks = await _retrieve_rag_context(state.get("project_id"), state["topic"])

    system, user = build_outline_messages(profile, state["topic"], source_chunks=source_chunks)

    try:
        raw = await _call_llm_mini(system, user)
        clean = strip_fences(raw)
        outline = json.loads(clean)
        return {"outline": outline, "_source_chunks": source_chunks, "error": None}
    except (json.JSONDecodeError, pydantic.ValidationError, openai.OpenAIError) as exc:
        logger.error("outline_generation_failed", error=str(exc))
        return {"error": str(exc), "_source_chunks": source_chunks}


def human_approval_node(state: DirectorState) -> DirectorState:
    """Stage 1.5: pass-through gate — graph is interrupted BEFORE this node.

    After the graph resumes (human called aupdate_state + ainvoke), this node
    runs and simply returns state unchanged. The conditional edge after this
    node decides whether to proceed to generate_storyboard.
    """
    return state


async def generate_storyboard_node(state: DirectorState) -> dict[str, Any]:
    """Stage 2: generate full storyboard from approved outline (expensive model)."""
    profile = NicheProfile.model_validate(state["niche_profile"])
    outline = state.get("outline") or []

    # I4: Reuse source chunks cached by outline_node — no second DB round-trip.
    source_chunks: list[str] = state.get("_source_chunks") or []

    system, user = build_full_storyboard_messages(
        niche_profile=profile,
        outline=outline,
        scene_count=state["scene_count"],
        target_duration_seconds=state["target_duration_seconds"],
        aspect_ratio=state.get("aspect_ratio", "16:9"),
        source_chunks=source_chunks,
    )

    try:
        raw = await _call_llm_full(system, user)
        clean = strip_fences(raw)
        storyboard = VideoStoryboard.model_validate_json(clean)
        return {"storyboard": storyboard.model_dump(), "error": None}
    except (json.JSONDecodeError, pydantic.ValidationError, openai.OpenAIError) as exc:
        logger.error("storyboard_generation_failed", error=str(exc))
        return {"error": str(exc)}


# ── Routing ────────────────────────────────────────────────────────────────────

def _route_after_approval(state: DirectorState) -> str:
    if state.get("outline_approved") and not state.get("error"):
        return "generate_storyboard"
    return END


# ── Graph Factory ──────────────────────────────────────────────────────────────

def build_creator_graph() -> StateGraph[DirectorState]:
    """Build the Creator Mode graph (not yet compiled)."""
    graph: StateGraph[DirectorState] = StateGraph(DirectorState)

    graph.add_node("outline", outline_node)
    graph.add_node("human_approval", human_approval_node)
    graph.add_node("generate_storyboard", generate_storyboard_node)

    graph.set_entry_point("outline")
    graph.add_edge("outline", "human_approval")
    graph.add_conditional_edges(
        "human_approval",
        _route_after_approval,
        {"generate_storyboard": "generate_storyboard", END: END},
    )
    graph.add_edge("generate_storyboard", END)

    return graph


_creator_graph: Any = None
_redis_saver_cm: Any = None
_creator_graph_lock = asyncio.Lock()


async def get_creator_graph() -> Any:
    """Return the compiled Creator Mode graph (singleton).

    Compiled once on first call and cached for the process lifetime.
    The AsyncRedisSaver context manager is stored at module level so it
    can be properly closed on shutdown via close_creator_graph().
    The double-checked lock prevents TOCTOU races under concurrent startup.
    """
    global _creator_graph, _redis_saver_cm
    if _creator_graph is not None:
        return _creator_graph
    async with _creator_graph_lock:
        if _creator_graph is None:
            settings = get_settings()
            _cm = AsyncRedisSaver.from_conn_string(settings.REDIS_URL)
            checkpointer = await _cm.__aenter__()
            await checkpointer.asetup()
            _redis_saver_cm = _cm
            _creator_graph = build_creator_graph().compile(
                checkpointer=checkpointer,
                interrupt_before=["human_approval"],
            )
    return _creator_graph


async def close_creator_graph() -> None:
    """Release the AsyncRedisSaver connection pool. Call during app shutdown."""
    global _redis_saver_cm
    if _redis_saver_cm is not None:
        await _redis_saver_cm.__aexit__(None, None, None)
        _redis_saver_cm = None

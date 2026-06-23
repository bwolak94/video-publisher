"""CrewAI Researcher Agent — LLM synthesis step.

This module is responsible ONLY for step 5 of the pipeline: synthesising
a ResearchReport from sanitised article content via an LLM.

Steps 1-4 (fetch, dedup, score, filter) are pure Python in job_handler.py.
The cheap model (gpt-4o-mini) is used per task rule #5.
"""
import asyncio
import json
from datetime import datetime, timezone

import structlog
from crewai import Agent, Crew, Task

from app.agents.researcher.sanitizer import SYSTEM_PROMPT_INJECTION_GUARD
from app.models.research import ResearchReport

logger = structlog.get_logger(__name__)

# Single shared agent instance — stateless, safe to reuse across calls.
_researcher_agent = Agent(
    role="Trend Research Analyst",
    goal="Extract key facts from news articles and produce a concise research report in JSON",
    backstory=(
        "You are an expert news analyst identifying viral content for video production. "
        f"{SYSTEM_PROMPT_INJECTION_GUARD}"
    ),
    llm="gpt-4o-mini",      # cheap model per task rule #5
    verbose=False,
    allow_delegation=False,
)


async def synthesize_report(
    channel_id: str,
    topic: str,
    sanitized_content: str,
    virality_score: float,
    source_url: str,
) -> ResearchReport:
    """Run the CrewAI agent to produce a ResearchReport from sanitised article content.

    The agent is given ONLY sanitised content (wrapped in <news_content> delimiters).
    The system prompt includes SYSTEM_PROMPT_INJECTION_GUARD.
    """
    task = Task(
        description=(
            f"{SYSTEM_PROMPT_INJECTION_GUARD}\n\n"
            f"Analyse the following news content and extract:\n"
            f"1. Three to five key facts (brief bullet points, plain text)\n"
            f"2. A one-paragraph summary\n\n"
            f"{sanitized_content}\n\n"
            f'Return ONLY valid JSON with keys: {{"keyFacts": [...], "rawSummary": "..."}}'
        ),
        expected_output='{"keyFacts": ["fact1", "fact2"], "rawSummary": "summary text"}',
        agent=_researcher_agent,
    )
    crew = Crew(agents=[_researcher_agent], tasks=[task], verbose=False)

    # Run synchronous CrewAI in a thread — avoids blocking the async event loop.
    result = await asyncio.to_thread(crew.kickoff)

    key_facts, raw_summary = _parse_synthesis_output(str(result), topic)

    return ResearchReport(
        channelId=channel_id,
        selectedTopic=topic,
        viralityScore=virality_score,
        keyFacts=key_facts,
        sourceUrls=[source_url],
        rawSummary=raw_summary,
        generatedAt=datetime.now(timezone.utc),
    )


def _parse_synthesis_output(raw: str, fallback_topic: str) -> tuple[list[str], str]:
    """Parse JSON from the agent output. Falls back gracefully on parse failure."""
    text = raw.strip()
    # Strip markdown code fences if the model wraps output in ```json ... ```
    if text.startswith("```"):
        parts = text.split("```")
        text = parts[1].removeprefix("json").strip() if len(parts) > 1 else text

    try:
        parsed = json.loads(text)
        return parsed.get("keyFacts", [fallback_topic]), parsed.get("rawSummary", "")
    except json.JSONDecodeError:
        logger.warning("synthesis_parse_failed", raw_preview=raw[:200])
        return [fallback_topic], raw[:500]

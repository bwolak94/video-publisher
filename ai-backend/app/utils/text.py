"""Shared text-processing utilities."""


def strip_fences(text: str) -> str:
    """Strip markdown code fences from LLM output.

    Handles both ``` and ```json variants. Returns the inner content trimmed.
    """
    text = text.strip()
    if text.startswith("```"):
        lines = text.split("\n")
        end = -1 if lines[-1].strip() == "```" else len(lines)
        text = "\n".join(lines[1:end])
    return text

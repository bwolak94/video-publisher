"""OpenAI text-embedding-3-small embeddings."""
from openai import AsyncOpenAI

_MODEL = "text-embedding-3-small"
_DIMENSIONS = 1536


async def embed_texts(texts: list[str]) -> list[list[float]]:
    """Embed a batch of texts. Returns list of 1536-dim vectors."""
    client = AsyncOpenAI()
    response = await client.embeddings.create(
        model=_MODEL,
        input=texts,
        dimensions=_DIMENSIONS,
    )
    return [item.embedding for item in response.data]


async def embed_query(text: str) -> list[float]:
    """Embed a single query string."""
    results = await embed_texts([text])
    return results[0]

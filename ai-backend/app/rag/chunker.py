"""Text chunking with overlap for RAG ingestion."""

CHUNK_SIZE = 2048     # characters (~512 tokens at 4 chars/token — RAG convention)
CHUNK_OVERLAP = 256   # characters (~64 tokens overlap)


def chunk_text(text: str, chunk_size: int = CHUNK_SIZE, overlap: int = CHUNK_OVERLAP) -> list[str]:
    """Split text into overlapping chunks.

    Simple character-based chunking. Splits on word boundaries to avoid
    cutting mid-word.
    """
    text = text.strip()
    if not text:
        return []

    overlap = min(overlap, chunk_size - 1)
    chunks: list[str] = []
    start = 0
    while start < len(text):
        end = start + chunk_size
        if end < len(text):
            # Walk back to nearest word boundary
            boundary = text.rfind(" ", start, end)
            if boundary > start:
                end = boundary
        chunk = text[start:end].strip()
        if chunk:
            chunks.append(chunk)
        start = end - overlap

    return chunks

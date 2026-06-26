"""Text chunking with overlap for RAG ingestion."""

CHUNK_SIZE = 512      # characters
CHUNK_OVERLAP = 64    # characters


def chunk_text(text: str, chunk_size: int = CHUNK_SIZE, overlap: int = CHUNK_OVERLAP) -> list[str]:
    """Split text into overlapping chunks.

    Simple character-based chunking. Splits on word boundaries to avoid
    cutting mid-word.
    """
    text = text.strip()
    if not text:
        return []

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

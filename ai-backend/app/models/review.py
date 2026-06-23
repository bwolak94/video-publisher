"""ReviewResult — output model for the QualityReviewer gate."""
from typing import Literal

from pydantic import BaseModel, ConfigDict


class ReviewResult(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    status: Literal["APPROVED", "REJECTED"]
    constraints: list[str] = []
    warnings: list[str] = []

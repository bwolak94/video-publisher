"""Job state models shared across agents."""
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict


class FailedJob(BaseModel):
    """Written to DLQ storage when all Director retry cycles are exhausted.

    PRD Section 3.3 retry behaviour: "On 3rd failure the job enters Dead Letter
    Queue and a human review alert is triggered."
    """

    model_config = ConfigDict(populate_by_name=True)

    jobId: str
    projectId: str = ""
    channelId: str = ""
    allConstraints: list[str]
    attemptCount: int
    failedAt: datetime
    alertFired: bool = False
    alertWebhookUrl: Optional[str] = None

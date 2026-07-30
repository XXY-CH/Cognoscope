"""At-least-once transactional outbox state."""

from dataclasses import dataclass
from enum import StrEnum


class OutboxStatus(StrEnum):
    PENDING = "pending"
    LEASED = "leased"
    DELIVERED = "delivered"
    POISON = "poison"


@dataclass(frozen=True)
class EventLease:
    event_id: str
    token: str
    fence: int
    event_type: str
    aggregate_id: str
    payload_json: str

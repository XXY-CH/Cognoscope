from __future__ import annotations

import hashlib
import hmac
import secrets


def random_token() -> str:
    return secrets.token_urlsafe(48)


def token_digest(token: str, secret: str) -> str:
    return hmac.new(secret.encode(), token.encode(), hashlib.sha256).hexdigest()


def constant_time_equal(left: str, right: str) -> bool:
    return hmac.compare_digest(left, right)


def payload_digest(payload: bytes) -> str:
    return hashlib.sha256(payload).hexdigest()

"""OpenAI-compatible LLM client for graph edge generation and knowledge tasks."""

from __future__ import annotations

import json
from dataclasses import dataclass
from collections.abc import AsyncIterator
from typing import Any

import httpx


@dataclass(frozen=True)
class AIResponse:
    content: str
    model: str
    usage_tokens: int


class AIClient:
    """Minimal OpenAI-compatible chat completion client."""

    def __init__(
        self,
        base_url: str,
        api_key: str,
        model: str,
        timeout_seconds: int = 60,
    ) -> None:
        self.base_url = base_url.rstrip("/")
        self.api_key = api_key
        self.model = model
        self.timeout = timeout_seconds

    async def chat_completion(
        self,
        messages: list[dict[str, str]],
        *,
        temperature: float = 0.7,
        max_tokens: int | None = None,
    ) -> AIResponse:
        """Call chat completion endpoint (OpenAI-compatible)."""
        if not self.api_key:
            raise ValueError("LLM API key is not configured")

        payload: dict[str, Any] = {
            "model": self.model,
            "messages": messages,
            "temperature": temperature,
        }
        if max_tokens is not None:
            payload["max_tokens"] = max_tokens

        async with httpx.AsyncClient(timeout=self.timeout) as client:
            response = await client.post(
                f"{self.base_url}/chat/completions",
                headers={
                    "Authorization": f"Bearer {self.api_key}",
                    "Content-Type": "application/json",
                },
                json=payload,
            )
            response.raise_for_status()
            data = response.json()

        content = data["choices"][0]["message"]["content"]
        usage = data.get("usage", {}).get("total_tokens", 0)
        return AIResponse(content=content, model=self.model, usage_tokens=usage)

    async def stream_chat_completion(
        self,
        messages: list[dict[str, str]],
        *,
        temperature: float = 0.7,
        max_tokens: int | None = None,
    ) -> AsyncIterator[str]:
        """Proxy an OpenAI-compatible SSE stream without exposing the API key."""
        if not self.api_key:
            raise ValueError("LLM API key is not configured")

        payload: dict[str, Any] = {
            "model": self.model,
            "messages": messages,
            "temperature": temperature,
            "stream": True,
        }
        if max_tokens is not None:
            payload["max_tokens"] = max_tokens

        async with httpx.AsyncClient(timeout=self.timeout) as client:
            async with client.stream(
                "POST",
                f"{self.base_url}/chat/completions",
                headers={
                    "Authorization": f"Bearer {self.api_key}",
                    "Content-Type": "application/json",
                },
                json=payload,
            ) as response:
                response.raise_for_status()
                async for line in response.aiter_lines():
                    if line:
                        yield f"{line}\n\n"

    def parse_json_response(self, response: AIResponse) -> dict[str, Any]:
        """Extract and parse JSON from LLM response (tolerant of wrapping text)."""
        value = response.content.strip()
        try:
            return json.loads(value)
        except json.JSONDecodeError:
            # Try to extract JSON from markdown code block or surrounding text
            start, end = value.find("{"), value.rfind("}")
            if start < 0 or end <= start:
                raise ValueError("LLM response does not contain parsable JSON")
            try:
                return json.loads(value[start : end + 1])
            except json.JSONDecodeError as exc:
                raise ValueError("LLM returned malformed JSON") from exc

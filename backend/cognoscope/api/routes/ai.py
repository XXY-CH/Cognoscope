"""AI-powered features: document summarization, chat, RAG."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field

from cognoscope.api.dependencies import FixedUser, get_ai_client, get_fixed_user
from cognoscope.application.ai_graph_service import AIGraphService
from cognoscope.infrastructure.ai import AIClient

router = APIRouter(tags=["ai"])


class ChatRequest(BaseModel):
    messages: list[dict[str, str]]
    temperature: float = Field(default=0.7, ge=0.0, le=2.0)
    max_tokens: int | None = None


class ChatResponse(BaseModel):
    content: str
    model: str
    usage_tokens: int


class SummaryResponse(BaseModel):
    title: str
    summary: str
    keywords: list[str]
    main_topics: list[str]


@router.post("/ai/chat", response_model=ChatResponse)
async def chat_completion(
    request: ChatRequest,
    user: FixedUser = Depends(get_fixed_user),
    ai: AIClient | None = Depends(get_ai_client),
) -> ChatResponse:
    """通用 AI 对话接口（转发到配置的 LLM BaseURL）"""
    if ai is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="AI service not configured (missing LLM_API_KEY)",
        )
    
    response = await ai.chat_completion(
        messages=request.messages,
        temperature=request.temperature,
        max_tokens=request.max_tokens,
    )
    
    return ChatResponse(
        content=response.content,
        model=response.model,
        usage_tokens=response.usage_tokens,
    )


@router.post("/documents/{document_id}/summarize", response_model=SummaryResponse)
async def summarize_document(
    document_id: str,
    max_chars: Annotated[int, Query(ge=100, le=10000)] = 5000,
    user: FixedUser = Depends(get_fixed_user),
    ai: AIClient | None = Depends(get_ai_client),
) -> SummaryResponse:
    """文档 AI 总结（通过配置的 LLM BaseURL）"""
    if ai is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="AI service not configured (missing LLM_API_KEY)",
        )
    
    # TODO: 从数据库获取文档内容
    # 目前返回示例数据
    text = f"Document {document_id} content placeholder..."
    
    ai_service = AIGraphService(ai)
    summary = await ai_service.summarize_document(text, max_chars=max_chars)
    
    return SummaryResponse(
        title=summary.title,
        summary=summary.summary,
        keywords=summary.keywords,
        main_topics=summary.main_topics,
    )


@router.post("/ai/ask")
async def ask_in_library(
    question: str = Query(..., min_length=1, max_length=500),
    library_id: str | None = None,
    user: FixedUser = Depends(get_fixed_user),
    ai: AIClient | None = Depends(get_ai_client),
) -> dict:
    """库内文档问答（RAG，TODO: 实现向量检索）"""
    if ai is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="AI service not configured (missing LLM_API_KEY)",
        )
    
    # TODO: 实现向量检索和 RAG
    # 目前返回占位响应
    response = await ai.chat_completion(
        messages=[
            {"role": "system", "content": "你是一个知识库助手。"},
            {"role": "user", "content": question},
        ],
        temperature=0.3,
    )
    
    return {
        "answer": response.content,
        "sources": [],
    }
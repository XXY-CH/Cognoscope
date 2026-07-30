from __future__ import annotations

import json
import re
from typing import Any

import httpx

from app.models import Annotation, Paper, db


ANALYSIS_PROMPT = """你是学术文献分析助手。请根据论文正文和用户批注输出严格 JSON，不要 Markdown 围栏：
{
  "summary": "200-400字证据约束阅读回顾",
  "keywords": ["关键词"],
  "themes": [{"name": "主题", "summary": "主题说明"}],
  "claims": [{"label": "可核验主张", "summary": "主张说明", "quote": "原文短引", "confidence": 0.0}],
  "relations": [{"source": "节点标签", "target": "节点标签", "relation": "supports|contradicts|related", "evidence": "原文短引", "confidence": 0.0}]
}
要求：所有 claims 和 relations 必须能在正文或批注中找到证据；找不到证据时不要编造；confidence 为 0-1。"""


def _extract_json(text: str) -> dict[str, Any]:
    value = (text or "").strip()
    fenced = re.search(r"```(?:json)?\s*([\s\S]*?)```", value)
    if fenced:
        value = fenced.group(1).strip()
    try:
        parsed = json.loads(value)
    except json.JSONDecodeError:
        start, end = value.find("{"), value.rfind("}")
        if start < 0 or end <= start:
            raise ValueError("LLM 未返回可解析 JSON") from None
        try:
            parsed = json.loads(value[start : end + 1])
        except json.JSONDecodeError as exc:
            raise ValueError("LLM 返回 JSON 格式错误") from exc
    if not isinstance(parsed, dict):
        raise ValueError("LLM 返回结果必须是 JSON 对象")
    return parsed


def _content(paper: Paper) -> str:
    if not paper.md_path:
        raise ValueError("论文尚未完成文本提取")
    from pathlib import Path

    path = Path(paper.md_path)
    if not path.exists():
        raise ValueError("论文正文文件不存在")
    return path.read_text(encoding="utf-8", errors="replace")


def _request_llm(base_url: str, api_key: str, model: str, prompt: str) -> str:
    endpoint = base_url.rstrip("/")
    if not endpoint.endswith("/chat/completions"):
        endpoint = f"{endpoint}/chat/completions"
    response = httpx.post(
        endpoint,
        headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
        json={
            "model": model,
            "temperature": 0.1,
            "messages": [
                {"role": "system", "content": "你只输出合法 JSON。"},
                {"role": "user", "content": prompt},
            ],
        },
        timeout=180,
    )
    response.raise_for_status()
    payload = response.json()
    try:
        return str(payload["choices"][0]["message"]["content"])
    except (KeyError, IndexError, TypeError) as exc:
        raise ValueError("LLM 响应缺少 choices[0].message.content") from exc


def analyze_paper(app, paper_id: int) -> None:
    with app.app_context():
        paper = db.session.get(Paper, paper_id)
        if not paper:
            return
        paper.llm_status = "running"
        paper.llm_error = None
        db.session.commit()
        try:
            api_key = (app.config.get("LLM_API_KEY") or "").strip()
            if not api_key:
                raise RuntimeError("未配置 LLM_API_KEY，分析不会降级为伪结果")
            annotations = Annotation.query.filter_by(paper_id=paper.id).all()
            annotation_text = "\n".join(
                f"- {annotation.selected_text}\n  批注：{annotation.note}"
                for annotation in annotations
            ) or "（无用户批注）"
            body = _content(paper)
            prompt = (
                f"论文标题：{paper.title}\n\n正文：\n{body[:120_000]}\n\n"
                f"用户批注：\n{annotation_text}\n\n{ANALYSIS_PROMPT}"
            )
            parsed = _extract_json(
                _request_llm(
                    app.config["LLM_BASE_URL"],
                    api_key,
                    app.config["LLM_MODEL"],
                    prompt,
                )
            )
            paper.llm_summary = json.dumps(parsed, ensure_ascii=False)
            paper.llm_status = "done"
            db.session.commit()
            from app.services.graph import persist_analysis_graph

            persist_analysis_graph(paper, parsed)
        except Exception as exc:  # noqa: BLE001
            paper.llm_status = "error"
            paper.llm_error = str(exc)
            db.session.commit()

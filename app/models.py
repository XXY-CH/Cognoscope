from __future__ import annotations

import json
from datetime import datetime, timezone

from flask_sqlalchemy import SQLAlchemy


db = SQLAlchemy()


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _json_loads(value: str | None, default):
    try:
        return json.loads(value or "")
    except (TypeError, json.JSONDecodeError):
        return default


class Paper(db.Model):
    __tablename__ = "papers"

    id = db.Column(db.Integer, primary_key=True)
    title = db.Column(db.String(512), nullable=False)
    original_filename = db.Column(db.String(512), nullable=False)
    source_path = db.Column(db.String(1024), nullable=False)
    md_path = db.Column(db.String(1024))
    content_hash = db.Column(db.String(64), index=True)
    page_count = db.Column(db.Integer, default=0, nullable=False)
    extraction_engine = db.Column(db.String(64))
    extraction_errors_json = db.Column(db.Text, default="[]", nullable=False)
    status = db.Column(db.String(32), default="processing", nullable=False)
    error_message = db.Column(db.Text)
    abstract = db.Column(db.Text)
    keywords_json = db.Column(db.Text, default="[]", nullable=False)
    llm_summary = db.Column(db.Text)
    llm_status = db.Column(db.String(32), default="idle", nullable=False)
    llm_error = db.Column(db.Text)
    created_at = db.Column(db.DateTime, default=utcnow, nullable=False)
    updated_at = db.Column(db.DateTime, default=utcnow, onupdate=utcnow, nullable=False)

    annotations = db.relationship(
        "Annotation", back_populates="paper", cascade="all, delete-orphan"
    )
    nodes = db.relationship(
        "KnowledgeNode", back_populates="paper", cascade="all, delete-orphan"
    )

    @property
    def keywords(self) -> list[str]:
        return _json_loads(self.keywords_json, [])

    @keywords.setter
    def keywords(self, value: list[str] | None) -> None:
        self.keywords_json = json.dumps(value or [], ensure_ascii=False)

    @property
    def extraction_errors(self) -> list[str]:
        return _json_loads(self.extraction_errors_json, [])

    @extraction_errors.setter
    def extraction_errors(self, value: list[str] | None) -> None:
        self.extraction_errors_json = json.dumps(value or [], ensure_ascii=False)

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "title": self.title,
            "original_filename": self.original_filename,
            "content_hash": self.content_hash,
            "page_count": self.page_count,
            "extraction_engine": self.extraction_engine,
            "extraction_errors": self.extraction_errors,
            "status": self.status,
            "error_message": self.error_message,
            "abstract": self.abstract,
            "keywords": self.keywords,
            "llm_status": self.llm_status,
            "llm_error": self.llm_error,
            "llm_summary": _json_loads(self.llm_summary, None),
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }


class Annotation(db.Model):
    __tablename__ = "annotations"

    id = db.Column(db.Integer, primary_key=True)
    paper_id = db.Column(db.Integer, db.ForeignKey("papers.id"), nullable=False, index=True)
    selected_text = db.Column(db.Text, nullable=False, default="")
    note = db.Column(db.Text, nullable=False, default="")
    page_number = db.Column(db.Integer)
    rects_json = db.Column(db.Text, default="[]", nullable=False)
    selectors_json = db.Column(db.Text, default="{}", nullable=False)
    tags_json = db.Column(db.Text, default="[]", nullable=False)
    created_at = db.Column(db.DateTime, default=utcnow, nullable=False)
    updated_at = db.Column(db.DateTime, default=utcnow, onupdate=utcnow, nullable=False)

    paper = db.relationship("Paper", back_populates="annotations")

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "paper_id": self.paper_id,
            "selected_text": self.selected_text,
            "note": self.note,
            "page_number": self.page_number,
            "rects": _json_loads(self.rects_json, []),
            "selectors": _json_loads(self.selectors_json, {}),
            "tags": _json_loads(self.tags_json, []),
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }


class KnowledgeNode(db.Model):
    __tablename__ = "knowledge_nodes"

    id = db.Column(db.Integer, primary_key=True)
    paper_id = db.Column(db.Integer, db.ForeignKey("papers.id"), index=True)
    kind = db.Column(db.String(32), nullable=False)
    label = db.Column(db.String(512), nullable=False)
    summary = db.Column(db.Text, default="", nullable=False)
    evidence_json = db.Column(db.Text, default="{}", nullable=False)
    confidence = db.Column(db.Float, default=0.0, nullable=False)
    review_status = db.Column(db.String(32), default="pending", nullable=False)
    created_at = db.Column(db.DateTime, default=utcnow, nullable=False)

    paper = db.relationship("Paper", back_populates="nodes")

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "paper_id": self.paper_id,
            "kind": self.kind,
            "label": self.label,
            "summary": self.summary,
            "evidence": _json_loads(self.evidence_json, {}),
            "confidence": self.confidence,
            "review_status": self.review_status,
        }


class KnowledgeEdge(db.Model):
    __tablename__ = "knowledge_edges"

    id = db.Column(db.Integer, primary_key=True)
    source_id = db.Column(db.Integer, db.ForeignKey("knowledge_nodes.id"), nullable=False)
    target_id = db.Column(db.Integer, db.ForeignKey("knowledge_nodes.id"), nullable=False)
    relation = db.Column(db.String(64), nullable=False)
    weight = db.Column(db.Float, default=0.0, nullable=False)
    evidence_json = db.Column(db.Text, default="{}", nullable=False)
    review_status = db.Column(db.String(32), default="pending", nullable=False)
    created_at = db.Column(db.DateTime, default=utcnow, nullable=False)

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "source_id": self.source_id,
            "target_id": self.target_id,
            "relation": self.relation,
            "weight": self.weight,
            "evidence": _json_loads(self.evidence_json, {}),
            "review_status": self.review_status,
        }


class Job(db.Model):
    __tablename__ = "jobs"

    id = db.Column(db.String(64), primary_key=True)
    kind = db.Column(db.String(64), nullable=False)
    paper_id = db.Column(db.Integer, db.ForeignKey("papers.id"), index=True)
    status = db.Column(db.String(32), nullable=False, default="queued")
    progress = db.Column(db.Integer, nullable=False, default=0)
    error_message = db.Column(db.Text)
    created_at = db.Column(db.DateTime, default=utcnow, nullable=False)
    updated_at = db.Column(db.DateTime, default=utcnow, onupdate=utcnow, nullable=False)

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "kind": self.kind,
            "paper_id": self.paper_id,
            "status": self.status,
            "progress": self.progress,
            "error_message": self.error_message,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }

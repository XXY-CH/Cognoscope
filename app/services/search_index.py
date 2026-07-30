from __future__ import annotations

from sqlalchemy import text

from app.models import Annotation, Paper, db


def ensure_fts_table() -> None:
    db.session.execute(
        text(
            """
            CREATE VIRTUAL TABLE IF NOT EXISTS document_search USING fts5(
                document_id UNINDEXED, title, content, keywords, annotations
            )
            """
        )
    )
    db.session.commit()


def upsert_paper(paper: Paper) -> None:
    body = ""
    if paper.md_path:
        from pathlib import Path

        path = Path(paper.md_path)
        if path.exists():
            body = path.read_text(encoding="utf-8", errors="replace")
    annotations = "\n".join(
        f"{annotation.selected_text}\n{annotation.note}"
        for annotation in Annotation.query.filter_by(paper_id=paper.id).all()
    )
    db.session.execute(
        text("DELETE FROM document_search WHERE document_id = :document_id"),
        {"document_id": str(paper.id)},
    )
    db.session.execute(
        text(
            "INSERT INTO document_search(document_id, title, content, keywords, annotations) "
            "VALUES (:document_id, :title, :content, :keywords, :annotations)"
        ),
        {
            "document_id": str(paper.id),
            "title": paper.title,
            "content": body,
            "keywords": " ".join(paper.keywords),
            "annotations": annotations,
        },
    )
    db.session.commit()


def delete_paper(paper_id: int) -> None:
    db.session.execute(
        text("DELETE FROM document_search WHERE document_id = :document_id"),
        {"document_id": str(paper_id)},
    )
    db.session.commit()


def search(query: str, limit: int = 50) -> list[dict]:
    terms = [token.replace('"', " ").strip() for token in (query or "").split()]
    terms = [f'"{token}"' for token in terms if token]
    if not terms:
        return []
    rows = db.session.execute(
        text(
            "SELECT document_id, title, snippet(document_search, 2, '<mark>', '</mark>', '…', 30) AS snippet "
            "FROM document_search WHERE document_search MATCH :match "
            "ORDER BY rank LIMIT :limit"
        ),
        {"match": " ".join(terms), "limit": max(1, min(limit, 100))},
    ).mappings()
    return [
        {"document_id": int(row["document_id"]), "title": row["title"], "snippet": row["snippet"]}
        for row in rows
    ]

from __future__ import annotations

import threading
from pathlib import Path

from flask import current_app

from app.models import Job, Paper, db
from app.services.converter import convert_pdf, sha256_file
from app.services.search_index import upsert_paper


def _run_extraction(app, paper_id: int, job_id: str) -> None:
    with app.app_context():
        paper = db.session.get(Paper, paper_id)
        job = db.session.get(Job, job_id)
        if not paper or not job:
            return
        try:
            job.status = "running"
            job.progress = 10
            db.session.commit()
            source = Path(paper.source_path)
            output = Path(app.config["PAPERS_DIR"]) / str(paper.id) / "content.md"
            result = convert_pdf(source, output, Path(paper.original_filename).stem)
            paper.content_hash = sha256_file(source)
            paper.md_path = str(output)
            paper.page_count = result["page_count"]
            paper.extraction_engine = result["engine"]
            paper.extraction_errors = result["errors"]
            paper.abstract = result["abstract"]
            paper.keywords = result["keywords"]
            paper.status = "ready"
            paper.error_message = None
            job.status = "done"
            job.progress = 100
            db.session.commit()
            upsert_paper(paper)
        except Exception as exc:  # noqa: BLE001
            paper.status = "error"
            paper.error_message = str(exc)
            job.status = "error"
            job.progress = 100
            job.error_message = str(exc)
            db.session.commit()


def queue_extraction(paper: Paper) -> Job:
    job_id = f"extract-{paper.id}-{int(paper.created_at.timestamp() * 1000)}"
    job = Job(id=job_id, kind="pdf_extraction", paper_id=paper.id)
    db.session.add(job)
    db.session.commit()
    app = current_app._get_current_object()
    threading.Thread(target=_run_extraction, args=(app, paper.id, job.id), daemon=True).start()
    return job

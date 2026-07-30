from __future__ import annotations

from pathlib import Path

from dotenv import load_dotenv
from flask import Flask, jsonify
from flask_cors import CORS

from app.config import Config, DATA_DIR, PAPERS_DIR, UPLOAD_DIR
from app.models import db


def _ensure_schema_columns() -> None:
    """Keep existing local SQLite databases compatible with new fields."""
    from sqlalchemy import text

    with db.engine.begin() as connection:
        paper_columns = {
            row[1] for row in connection.execute(text("PRAGMA table_info(papers)"))
        }
        additions = {
            "content_hash": "TEXT",
            "page_count": "INTEGER DEFAULT 0",
            "extraction_engine": "TEXT",
            "extraction_errors_json": "TEXT DEFAULT '[]'",
            "llm_summary": "TEXT",
            "llm_status": "TEXT DEFAULT 'idle'",
            "llm_error": "TEXT",
        }
        for name, sql_type in additions.items():
            if name not in paper_columns:
                connection.execute(text(f"ALTER TABLE papers ADD COLUMN {name} {sql_type}"))


def create_app() -> Flask:
    load_dotenv()
    app = Flask(__name__)
    app.config.from_object(Config)
    CORS(app, origins=list(app.config["CORS_ORIGINS"]))

    for directory in (DATA_DIR, UPLOAD_DIR, PAPERS_DIR):
        Path(directory).mkdir(parents=True, exist_ok=True)

    db.init_app(app)

    from app.routes.api import api_bp

    app.register_blueprint(api_bp, url_prefix="/api/v1")

    @app.get("/api/health")
    def health():
        return jsonify({"status": "ok", "service": "xuesen-library"})

    with app.app_context():
        db.create_all()
        _ensure_schema_columns()
        from app.services.search_index import ensure_fts_table

        ensure_fts_table()

    return app


app = create_app()

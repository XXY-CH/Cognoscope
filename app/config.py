from __future__ import annotations

import os
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data"
UPLOAD_DIR = DATA_DIR / "uploads"
PAPERS_DIR = DATA_DIR / "papers"
DB_PATH = DATA_DIR / "literature.db"


class Config:
    SECRET_KEY = os.environ.get("FLASK_SECRET_KEY", "xuesen-dev-secret")
    SQLALCHEMY_DATABASE_URI = f"sqlite:///{DB_PATH.as_posix()}"
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    MAX_CONTENT_LENGTH = 200 * 1024 * 1024
    UPLOAD_DIR = UPLOAD_DIR
    PAPERS_DIR = PAPERS_DIR
    ALLOWED_EXTENSIONS = {"pdf", "epub", "docx", "doc", "html", "htm", "md", "txt"}
    CORS_ORIGINS = tuple(
        origin.strip()
        for origin in os.environ.get(
            "XUESEN_CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173"
        ).split(",")
        if origin.strip()
    )
    LLM_BASE_URL = os.environ.get("LLM_BASE_URL", "https://api.openai.com/v1")
    LLM_API_KEY = os.environ.get("LLM_API_KEY", "")
    LLM_MODEL = os.environ.get("LLM_MODEL", "gpt-4o-mini")

from __future__ import annotations

from contextlib import asynccontextmanager
from typing import AsyncIterator

import uvicorn
from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from cognoscope.api.errors import error_body, install_exception_handlers
from cognoscope.api.routes import ai, annotations, graph, health, imports, jobs, knowledge, library, preferences
from cognoscope.api.schemas import ErrorEnvelope
from cognoscope.application.job_service import JobService
from cognoscope.application.preference_service import PreferenceService
from cognoscope.application.graph_service import GraphService
from cognoscope.config import Settings
from cognoscope.infrastructure.database import Database
from cognoscope.infrastructure.postgres.extraction_repository import ExtractionRepository
from cognoscope.infrastructure.postgres.authority_repository import AuthorityRepository
from cognoscope.infrastructure.ai import AIClient

ERROR_RESPONSES = {
    "default": {
        "description": "API error response.",
        "model": ErrorEnvelope,
    },
    422: {
        "description": "Request validation failed.",
        "model": ErrorEnvelope,
    },
}


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or Settings()

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        database = Database(settings)
        app.state.database = database
        app.state.job_service = JobService(database.session_factory)
        app.state.extraction_repository = ExtractionRepository(database.session_factory)
        app.state.authority_repository = AuthorityRepository(database.session_factory)
        app.state.preference_service = PreferenceService(app.state.authority_repository)
        ai_client = AIClient(settings.llm_base_url, settings.llm_api_key, settings.llm_model, settings.llm_timeout_seconds) if settings.llm_api_key else None
        app.state.graph_service = GraphService(database.session_factory, ai_client)
        if settings.auto_create_schema:
            await database.create_schema()
        try:
            yield
        finally:
            await database.dispose()

    app = FastAPI(
        title="Congnoscope Backend API",
        version="0.1.0",
        description="Single-user research workspace API (Beat integration without auth).",
        lifespan=lifespan,
        docs_url="/docs",
        redoc_url=None,
        responses=ERROR_RESPONSES,
    )
    app.state.settings = settings
    
    app.add_middleware(
        CORSMiddleware,
        allow_origins=list(settings.allowed_origins),
        allow_credentials=True,
        allow_methods=["GET", "POST", "PUT", "DELETE"],
        allow_headers=["Content-Type"],
    )
    install_exception_handlers(app)

    @app.exception_handler(RequestValidationError)
    async def handle_request_validation(_: Request, exc: RequestValidationError) -> JSONResponse:
        return JSONResponse(status_code=422, content=error_body("validation_error", "Request validation failed", exc.errors()))

    # Register routes (auth and external_authorizations removed)
    app.include_router(health.router, prefix="/api/v1")
    app.include_router(imports.router, prefix="/api/v1")
    app.include_router(library.router, prefix="/api/v1")
    app.include_router(jobs.router, prefix="/api/v1")
    app.include_router(annotations.router, prefix="/api/v1")
    app.include_router(knowledge.router, prefix="/api/v1")
    app.include_router(preferences.router, prefix="/api/v1")
    app.include_router(graph.router, prefix="/api/v1")
    app.include_router(ai.router, prefix="/api/v1")
    return app


app = create_app()


def run() -> None:
    uvicorn.run("cognoscope.api.main:app", host="127.0.0.1", port=8000, reload=True)

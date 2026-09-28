from __future__ import annotations

from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.core.config import Settings
from app.core.container import build_container
from app.main import create_app
from app.providers.hashing_embedder import HashingEmbedder
from tests.stub_provider import ScriptedProvider

FIXTURES = Path(__file__).parent / "fixtures"
KNOWLEDGE_DIR = Path(__file__).resolve().parents[2] / "backend" / "src" / "seed" / "knowledge"


def make_settings(**overrides) -> Settings:
    base = dict(
        environment="test",
        vector_store="local",
        vector_db_path="",
        ai_service_token=None,
        rag_min_score=0.0,
        rag_bootstrap_dir="",  # startup indexing is tested explicitly in test_bootstrap.py
        _env_file=None,
    )
    base.update(overrides)
    return Settings(**base)


@pytest.fixture
def provider() -> ScriptedProvider:
    return ScriptedProvider()


@pytest.fixture
def settings() -> Settings:
    return make_settings()


@pytest.fixture
def container(settings, provider):
    return build_container(settings, provider=provider, embedder=HashingEmbedder(256))


@pytest.fixture
def client(settings, container):
    app = create_app(settings, container)
    with TestClient(app) as c:
        yield c


@pytest.fixture
def kb_documents():
    from app.rag.loaders import load_directory

    if not KNOWLEDGE_DIR.exists():
        pytest.skip("knowledge base directory not found")
    return load_directory(KNOWLEDGE_DIR)

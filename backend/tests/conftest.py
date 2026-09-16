"""Shared pytest fixtures for the backend test suite."""

import pytest
from fastapi.testclient import TestClient

from app.main import app

ADMIN_HEADERS = {"Authorization": "Bearer demo-token-sih"}
RESCUE_HEADERS = {"Authorization": "Bearer demo-token-rescue"}


@pytest.fixture
def client():
    return TestClient(app)


@pytest.fixture
def admin_headers():
    return ADMIN_HEADERS


@pytest.fixture
def rescue_headers():
    return RESCUE_HEADERS

"""Runtime configuration loaded from environment / .env.

Cognee fields are optional: when absent, the app falls back to the in-memory
store so it still boots (and the public repo stays runnable without secrets).
"""

from __future__ import annotations

from typing import Literal

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # "cloud" (default) → CogneeCloudStore over REST (needs the keys below).
    # "local" → in-process cognee lib (no cloud secrets; reads its own
    # LLM_*/EMBEDDING_* env vars per https://docs.cognee.ai).
    cognee_mode: Literal["cloud", "local"] = Field(
        default="cloud", alias="COGNEE_MODE"
    )

    cognee_api_key: str | None = None
    cognee_api_base_url: str | None = None
    cognee_tenant: str | None = None
    cognee_user_id: str | None = None

    # Dataset all ingested text is grouped under. Read from env COGNEE_BRAIN.
    cognee_dataset: str = Field(default="ontology_dataset", alias="COGNEE_BRAIN")

    # Shared secret the frontend must send as X-API-Key on /api/* calls.
    # When unset, auth is open — keeps the public repo runnable without secrets.
    api_key: str | None = None

    # Expose /docs, /redoc, /openapi.json. Default off; enable in dev.
    docs_enabled: bool = False

    @property
    def cognee_enabled(self) -> bool:
        return bool(self.cognee_api_key and self.cognee_api_base_url)

    @property
    def auth_enabled(self) -> bool:
        return bool(self.api_key)


settings = Settings()

"""Runtime configuration loaded from environment / .env.

Cognee fields are optional: when absent, the app falls back to the in-memory
store so it still boots (and the public repo stays runnable without secrets).
"""

from __future__ import annotations

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    cognee_api_key: str | None = None
    cognee_api_base_url: str | None = None
    cognee_tenant: str | None = None
    cognee_user_id: str | None = None

    # Dataset all ingested text is grouped under. Read from env COGNEE_BRAIN.
    cognee_dataset: str = Field(default="ontology_dataset", alias="COGNEE_BRAIN")

    @property
    def cognee_enabled(self) -> bool:
        return bool(self.cognee_api_key and self.cognee_api_base_url)


settings = Settings()

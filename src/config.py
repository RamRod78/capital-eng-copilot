import os
from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application configuration settings loaded from environment variables."""

    # Gemini API Configuration
    gemini_api_key: str = Field(default="", alias="GEMINI_API_KEY")
    gemini_model: str = Field(default="gemini-2.5-flash", alias="GEMINI_MODEL")
    gemini_embedding_model: str = Field(default="text-embedding-004", alias="GEMINI_EMBEDDING_MODEL")
    embedding_dimension: int = Field(default=768, alias="EMBEDDING_DIMENSION")

    # Database Configuration
    database_url: str = Field(
        default="postgresql://postgres:postgres@localhost:5432/capital_eng",
        alias="DATABASE_URL",
    )

    # Streamlit Server Settings
    streamlit_server_port: int = Field(default=8501, alias="STREAMLIT_SERVER_PORT")
    streamlit_server_address: str = Field(default="0.0.0.0", alias="STREAMLIT_SERVER_ADDRESS")

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )


settings = Settings()

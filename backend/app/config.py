import os
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    DATABASE_URL: str = "sqlite:///./smart_reader.db"
    SECRET_KEY: str = "your-secret-key-here"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    ENVIRONMENT: str = "development"
    DB_ECHO: bool = False
    LOG_LEVEL: str = "INFO"  # 添加日志级别配置
    # OSS配置
    OSS_PROVIDER: str = "local"  # 可选: local, aws_s3, aliyun
    AWS_ACCESS_KEY_ID: str = ""
    AWS_SECRET_ACCESS_KEY: str = ""
    AWS_REGION: str = "us-east-1"
    AWS_S3_BUCKET_NAME: str = "your-bucket-name"
    ALIYUN_ACCESS_KEY_ID: str = ""
    ALIYUN_SECRET_ACCESS_KEY: str = ""
    ALIYUN_OSS_ENDPOINT: str = ""
    ALIYUN_OSS_BUCKET_NAME: str = "your-bucket-name"
    # AI / Embedding
    EMBEDDING_MODEL: str = "all-MiniLM-L6-v2"
    EMBEDDING_TOP_K: int = 5
    QA_EVIDENCE_THRESHOLD: float = 0.5
    # LLM
    LLM_PROVIDER: str = "mock"  # mock | openai | ollama
    LLM_BASE_URL: str = "http://localhost:11434"  # ollama default
    LLM_API_KEY: str = ""
    LLM_MODEL: str = "llama3"
    LLM_MAX_TOKENS: int = 512
    LLM_TEMPERATURE: float = 0.3


class DevelopmentSettings(Settings):
    model_config = SettingsConfigDict(
        env_file=".env.dev",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    DATABASE_URL: str = "sqlite:///./smart_reader.db"
    DEBUG: bool = True
    DB_ECHO: bool = True  # 开发环境默认开启数据库回显
    LOG_LEVEL: str = "DEBUG"  # 添加日志级别配置


class TestSettings(Settings):
    model_config = SettingsConfigDict(
        env_file=".env.stage",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    DATABASE_URL: str = "sqlite:///./test_smart_reader.db"
    TESTING: bool = True
    DB_ECHO: bool = False
    LOG_LEVEL: str = "WARNING"  # 测试环境减少日志输出


class ProductionSettings(Settings):
    model_config = SettingsConfigDict(
        env_file=".env.prod",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    DATABASE_URL: str = "postgresql://user:password@localhost/prod_db"
    DEBUG: bool = False
    DB_ECHO: bool = False
    LOG_LEVEL: str = "WARNING"  # 生产环境只记录警告及以上级别


def get_settings():
    env = os.getenv("ENVIRONMENT", "development")
    if env == "development":
        return DevelopmentSettings()
    elif env == "testing":
        return TestSettings()
    elif env == "production":
        return ProductionSettings()
    else:
        return Settings()


settings = get_settings()
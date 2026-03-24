import os
from typing import Optional
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    DATABASE_URL: str = os.getenv("DATABASE_URL", "sqlite:///./smart_reader.db")
    SECRET_KEY: str = os.getenv("SECRET_KEY", "your-secret-key-here")
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    ENVIRONMENT: str = os.getenv("ENVIRONMENT", "development")
    DB_ECHO: bool = os.getenv("DB_ECHO", "False").lower() == "true"
    LOG_LEVEL: str = "INFO"  # 添加日志级别配置

    class Config:
        env_file = ".env"


class DevelopmentSettings(Settings):
    DATABASE_URL: str = os.getenv("DATABASE_URL", "sqlite:///./smart_reader.db")
    DEBUG: bool = True
    DB_ECHO: bool = os.getenv("DB_ECHO", "True").lower() == "true"  # 开发环境默认开启数据库回显
    LOG_LEVEL: str = "DEBUG"  # 添加日志级别配置

    class Config:
        env_file = ".env.dev"


class TestSettings(Settings):
    DATABASE_URL: str = os.getenv("DATABASE_URL", "sqlite:///./test_smart_reader.db")
    TESTING: bool = True
    DB_ECHO: bool = False
    LOG_LEVEL: str = "WARNING"  # 测试环境减少日志输出

    class Config:
        env_file = ".env.stage"


class ProductionSettings(Settings):
    DATABASE_URL: str = os.getenv("DATABASE_URL", "postgresql://user:password@localhost/prod_db")
    DEBUG: bool = False
    DB_ECHO: bool = os.getenv("DB_ECHO", "False").lower() == "true"
    LOG_LEVEL: str = "WARNING"  # 生产环境只记录警告及以上级别

    class Config:
        env_file = ".env.prod"


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
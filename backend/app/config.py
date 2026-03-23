from pydantic_settings import BaseSettings
from typing import Optional
import os

class Settings(BaseSettings):
    # 数据库配置 - 支持多种数据库
    DATABASE_URL: str = "sqlite:///./smart_reader.db"  # 默认使用SQLite
    DB_ECHO: bool = False
    
    # JWT配置
    SECRET_KEY: str = "your-default-secret-key-change-in-production"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    
    # 上传配置
    UPLOAD_DIR: str = "uploads"
    MAX_FILE_SIZE: int = 50 * 1024 * 1024  # 50MB
    ALLOWED_EXTENSIONS: set = {"pdf", "epub", "mobi", "txt"}
    
    # 环境配置
    ENVIRONMENT: str = "development"
    
    # 日志配置
    LOG_LEVEL: str = "INFO"
    
    class Config:
        env_file = ".env"
        case_sensitive = True

class DevelopmentSettings(Settings):
    ENVIRONMENT: str = "development"
    DB_ECHO: bool = True
    LOG_LEVEL: str = "DEBUG"
    
    # 可以通过环境变量指定使用PostgreSQL
    DATABASE_URL: str = os.getenv("DEV_DATABASE_URL", "sqlite:///./smart_reader_dev.db")
    
    class Config:
        env_prefix = "DEV_"

class StagingSettings(Settings):
    ENVIRONMENT: str = "staging"
    LOG_LEVEL: str = "WARNING"
    DATABASE_URL: str = os.environ.get("STAGE_DATABASE_URL", "postgresql+asyncpg://user:password@localhost/stage_smart_reader")
    
    class Config:
        env_prefix = "STAGE_"

class ProductionSettings(Settings):
    ENVIRONMENT: str = "production"
    SECRET_KEY: str = os.environ.get("PROD_SECRET_KEY", "")
    DB_ECHO: bool = False
    LOG_LEVEL: str = "ERROR"
    DATABASE_URL: str = os.environ.get("PROD_DATABASE_URL", "postgresql+asyncpg://user:password@localhost/prod_smart_reader")
    
    class Config:
        env_prefix = "PROD_"

def get_settings():
    env = os.getenv("ENVIRONMENT", "development").lower()
    
    if env == "production":
        return ProductionSettings()
    elif env == "staging":
        return StagingSettings()
    else:
        return DevelopmentSettings()
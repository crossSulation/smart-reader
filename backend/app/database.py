from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
from .config import get_settings

settings = get_settings()

# 确保数据库 URL 不为空
database_url = settings.DATABASE_URL
if not database_url or database_url.strip() == "":
    # 如果数据库 URL 为空，使用默认值
    database_url = "sqlite+aiosqlite:///./smart_reader.db"

# 异步数据库引擎
if database_url.startswith("sqlite"):
    # 对于SQLite，我们需要使用 aiosqlite 引擎
    if not database_url.startswith("sqlite+aiosqlite"):
        # 如果不是 aiosqlite 格式，转换为 aiosqlite 格式
        if database_url.startswith("sqlite:///"):
            processed_url = database_url.replace("sqlite:///", "sqlite+aiosqlite:///")
        elif database_url.startswith("sqlite:"):
            processed_url = database_url.replace("sqlite:", "sqlite+aiosqlite:")
        else:
            processed_url = f"sqlite+aiosqlite://{database_url[len('sqlite:'):]}"
    else:
        processed_url = database_url

    async_engine = create_async_engine(
        processed_url,
        echo=settings.DB_ECHO,
        connect_args={"check_same_thread": False}  # SQLite特定参数
    )
else:
    # PostgreSQL或其他数据库的异步引擎
    if database_url.startswith("postgresql+asyncpg"):
        processed_url = database_url
    elif database_url.startswith("postgresql"):
        # 如果是同步的postgresql URL，转换为异步格式
        processed_url = database_url.replace("postgresql:", "postgresql+asyncpg:")
    else:
        processed_url = database_url

    async_engine = create_async_engine(
        processed_url,
        echo=settings.DB_ECHO
    )

AsyncSessionLocal = async_sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=async_engine
)

# 同步引擎（用于Alembic迁移）
if database_url.startswith("sqlite"):
    # 对于SQLite，使用原始URL（同步格式）
    if database_url.startswith("sqlite+aiosqlite"):
        sync_url = database_url.replace("sqlite+aiosqlite:", "sqlite:")
    else:
        sync_url = database_url
    sync_engine = create_engine(
        sync_url,
        echo=settings.DB_ECHO,
        connect_args={"check_same_thread": False}
    )
else:
    # 对于PostgreSQL，使用同步格式
    if database_url.startswith("postgresql+asyncpg"):
        sync_url = database_url.replace("postgresql+asyncpg:", "postgresql:")
    else:
        sync_url = database_url
    sync_engine = create_engine(
        sync_url,
        echo=settings.DB_ECHO
    )

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=sync_engine)

Base = declarative_base()

# 获取异步数据库会话
async def get_async_db():
    async with AsyncSessionLocal() as db:
        yield db

# 获取同步数据库会话
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
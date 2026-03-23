from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.config import get_settings
from app.routers import auth, books, files, upload
import logging

settings = get_settings()

# 配置日志
logging.basicConfig(level=getattr(logging, settings.LOG_LEVEL))

app = FastAPI(title="Smart Reader API", version="1.0.0")

# CORS中间件配置
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # 在生产环境中应限制为特定域名
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 包含路由
app.include_router(auth.router)
app.include_router(books.router)
app.include_router(files.router)
app.include_router(upload.router)

@app.get("/")
def read_root():
    return {"message": f"Smart Reader API - Environment: {settings.ENVIRONMENT}"}

@app.get("/health")
def health_check():
    return {
        "status": "healthy",
        "environment": settings.ENVIRONMENT,
        "database_url": settings.DATABASE_URL
    }
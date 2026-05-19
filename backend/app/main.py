from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.routers import ai, auth, books, files, upload, ingestion, learning, personalization
import os

app = FastAPI(title="Smart Reader API")

# CORS中间件
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # 生产环境中应更具体
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 包含路由
app.include_router(auth.router, prefix="/api")
app.include_router(books.router, prefix="/api")
app.include_router(upload.router, prefix="/api")
app.include_router(files.router, prefix="/api")
app.include_router(ingestion.router, prefix="/api")
app.include_router(ai.router, prefix="/api")
app.include_router(learning.router, prefix="/api")
app.include_router(personalization.profile_router, prefix="/api")
app.include_router(personalization.analytics_router, prefix="/api")

@app.get("/")
def read_root():
    return {"Hello": "World"}

@app.get("/health")
def health_check():
    return {"status": "healthy"}
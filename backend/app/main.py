from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.routers import auth, books, files, upload
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
app.include_router(auth.router, prefix="/api/auth")
app.include_router(books.router, prefix="/api/books")
app.include_router(upload.router, prefix="/api/upload")
app.include_router(files.router, prefix="/api/files")

@app.get("/")
def read_root():
    return {"Hello": "World"}

@app.get("/health")
def health_check():
    return {"status": "healthy"}
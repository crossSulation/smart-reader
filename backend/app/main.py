from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from app.routers import ai, auth, books, files, upload, ingestion, learning, personalization, knowledge, billing
import os

app = FastAPI(title="Smart Reader API")

# CORS中间件
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Credit status middleware — adds X-Credit-* headers to authenticated responses
@app.middleware("http")
async def credit_header_middleware(request: Request, call_next):
    response: Response = await call_next(request)

    # Only add headers for API routes with authenticated users
    if request.url.path.startswith("/api/") and response.status_code < 400:
        try:
            auth_header = request.headers.get("Authorization", "")
            if auth_header.startswith("Bearer "):
                token = auth_header.replace("Bearer ", "")
                from app.routers.auth import AuthService
                from app.database import SessionLocal
                from app.services.credit_service import ensure_monthly_credits

                try:
                    user_data = AuthService.decode_token(token)
                except Exception:
                    return response

                db = SessionLocal()
                try:
                    from app.models import User
                    user = db.query(User).filter(User.username == user_data["username"]).first()
                    if user:
                        balance = ensure_monthly_credits(db, user.id)
                        if balance <= 0:
                            status = "exhausted"
                        elif balance <= 10000:
                            status = "low"
                        else:
                            status = "ok"
                        response.headers["X-Credit-Balance"] = str(int(balance))
                        response.headers["X-Credit-Status"] = status
                finally:
                    db.close()
        except Exception:
            pass

    return response

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
app.include_router(knowledge.router)
app.include_router(billing.router)

@app.get("/")
def read_root():
    return {"Hello": "World"}

@app.get("/health")
def health_check():
    return {"status": "healthy"}
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from fastapi.openapi.utils import get_openapi
from app.routers import ai, auth, books, files, upload, ingestion, learning, personalization, knowledge, billing
import logging
import os

# ── Logging setup ──────────────────────────────────────────────
from app.config import get_settings

settings = get_settings()
log_level = getattr(logging, settings.LOG_LEVEL.upper(), logging.INFO)

root_logger = logging.getLogger()
root_logger.setLevel(log_level)

# Avoid duplicate handlers on uvicorn reload
if root_logger.handlers:
    for h in root_logger.handlers:
        root_logger.removeHandler(h)

# Console handler
console = logging.StreamHandler()
console.setLevel(log_level)
console.setFormatter(logging.Formatter("%(asctime)s  %(levelname)-8s  %(name)s  %(message)s"))
root_logger.addHandler(console)

# File handler — daily rotation, keep 30 days
log_dir = "logs"
os.makedirs(log_dir, exist_ok=True)
from logging.handlers import TimedRotatingFileHandler

file_handler = TimedRotatingFileHandler(
    os.path.join(log_dir, "app.log"),
    when="midnight",
    interval=1,
    backupCount=30,
    encoding="utf-8",
)
file_handler.setLevel(log_level)
file_handler.setFormatter(logging.Formatter(
    "%(asctime)s  %(levelname)-8s  %(name)s  [%(filename)s:%(lineno)d]  %(message)s"
))
root_logger.addHandler(file_handler)

# Quiet noisy third-party loggers
logging.getLogger("sqlalchemy.engine").setLevel(logging.WARNING)
logging.getLogger("httpx").setLevel(logging.WARNING)
logging.getLogger("httpcore").setLevel(logging.WARNING)
# ──────────────────────────────────────────────────────────────

app = FastAPI(
    title="Smart Reader API",
    description="""
## Smart Reader Backend API

AI-powered reading assistant with retrieval-augmented generation, knowledge graph, and spaced repetition.

### Authentication
Most endpoints require a Bearer JWT token. Obtain one via `POST /api/auth/login`.

Click the **Authorize** button (🔒) and enter: `Bearer <your-token>`

### Credit System
Cloud AI calls consume credits. Each response includes `X-Credit-Balance` and `X-Credit-Status` headers.
    """,
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
    openapi_url="/openapi.json",
    swagger_ui_parameters={"defaultModelsExpandDepth": -1},
)

# OpenAPI security scheme — adds Authorize button in Swagger UI
def custom_openapi():
    if app.openapi_schema:
        return app.openapi_schema
    openapi_schema = get_openapi(
        title=app.title,
        version=app.version,
        description=app.description,
        routes=app.routes,
    )
    openapi_schema["components"]["securitySchemes"] = {
        "BearerAuth": {
            "type": "http",
            "scheme": "bearer",
            "bearerFormat": "JWT",
            "description": "Enter your JWT token from POST /api/auth/login",
        }
    }
    openapi_schema["security"] = [{"BearerAuth": []}]
    app.openapi_schema = openapi_schema
    return openapi_schema

app.openapi = custom_openapi

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
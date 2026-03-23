import os
import uvicorn

if __name__ == "__main__":
    os.environ["ENVIRONMENT"] = "production"
    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=8000,
        reload=False,
        log_level="error"
    )
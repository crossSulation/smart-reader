import os
import uvicorn
from app.config import DevelopmentSettings

def run_dev():
    # 设置开发环境
    os.environ["ENVIRONMENT"] = "development"
    
    # 启动开发服务器
    uvicorn.run(
        "app.main:app",
        host="127.0.0.1",
        port=8000,
        reload=True,
        log_level="debug"
    )

if __name__ == "__main__":
    run_dev()
import os
import uvicorn
from app.config import TestSettings

def run_stage():
    # 设置预发布环境
    os.environ["ENVIRONMENT"] = "testing"
    
    # 启动预发布服务器
    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=8001,
        reload=False,
        log_level="info"
    )

if __name__ == "__main__":
    run_stage()
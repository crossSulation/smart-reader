import os
import uvicorn
from app.config import ProductionSettings

def run_prod():
    # 设置生产环境
    os.environ["ENVIRONMENT"] = "production"
    
    # 启动生产服务器
    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=8000,
        reload=False,
        log_level="warning"
    )

if __name__ == "__main__":
    run_prod()
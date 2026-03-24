import asyncio
import httpx
import sys

async def check_backend_health():
    """检查后端服务健康状态"""
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get("http://localhost:8000/health")
            if response.status_code == 200:
                print("✓ Backend service is running and healthy!")
                print(f"Response: {response.json()}")
                return True
            else:
                print(f"✗ Backend returned status code: {response.status_code}")
                return False
    except httpx.ConnectError:
        print("✗ Cannot connect to backend service. Is it running?")
        return False
    except Exception as e:
        print(f"✗ Error checking backend health: {str(e)}")
        return False

if __name__ == "__main__":
    print("Checking backend health...")
    is_healthy = asyncio.run(check_backend_health())
    
    if not is_healthy:
        print("\nTip: Run 'cd backend && start_server.bat' to start the backend server")
        sys.exit(1)
    else:
        print("\nBackend is ready to serve requests!")
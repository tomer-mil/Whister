import asyncio
from httpx import AsyncClient
from app.main import create_app

async def test():
    app = create_app()
    async with AsyncClient(app=app, base_url="http://test") as client:
        # Register
        reg_response = await client.post(
            "/api/v1/auth/register",
            json={
                "username": "testuser",
                "email": "test@example.com",
                "password": "TestPass123",
                "display_name": "Test User",
            },
        )
        print("Register status:", reg_response.status_code)
        print("Register response:", reg_response.json())
        
        # Login
        login_response = await client.post(
            "/api/v1/auth/login",
            json={
                "email": "test@example.com",
                "password": "TestPass123",
            },
        )
        print("Login status:", login_response.status_code)
        print("Login response:", login_response.json())

asyncio.run(test())

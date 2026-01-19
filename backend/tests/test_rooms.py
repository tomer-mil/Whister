"""Room service tests."""
import pytest
from httpx import AsyncClient


@pytest.mark.asyncio  # type: ignore
async def test_create_room_success(client: AsyncClient) -> None:
    """Test successful room creation."""
    # Register and login
    reg_response = await client.post(
        "/api/v1/auth/register",
        json={
            "username": "admin",
            "email": "admin@example.com",
            "password": "TestPass123",
            "display_name": "Admin User",
        },
    )
    access_token = reg_response.json()["tokens"]["access_token"]

    # Create room
    response = await client.post(
        "/api/v1/rooms",
        headers={"Authorization": f"Bearer {access_token}"},
        json={},
    )

    assert response.status_code == 201
    data = response.json()
    assert "room_code" in data
    assert len(data["room_code"]) == 6
    assert data["room_code"].isupper()
    assert "game_id" in data
    assert data["admin_id"] == reg_response.json()["id"]
    assert data["status"] == "waiting"
    assert "ws_endpoint" in data


@pytest.mark.asyncio  # type: ignore
async def test_create_room_unauthorized(client: AsyncClient) -> None:
    """Test room creation without authentication."""
    response = await client.post(
        "/api/v1/rooms",
        json={},
    )

    assert response.status_code == 403


@pytest.mark.asyncio  # type: ignore
async def test_get_room_success(client: AsyncClient) -> None:
    """Test getting room state."""
    # Register and create room
    reg_response = await client.post(
        "/api/v1/auth/register",
        json={
            "username": "admin",
            "email": "admin@example.com",
            "password": "TestPass123",
            "display_name": "Admin",
        },
    )
    access_token = reg_response.json()["tokens"]["access_token"]
    user_id = reg_response.json()["id"]

    create_response = await client.post(
        "/api/v1/rooms",
        headers={"Authorization": f"Bearer {access_token}"},
        json={},
    )
    room_code = create_response.json()["room_code"]

    # Get room
    response = await client.get(
        f"/api/v1/rooms/{room_code}",
        headers={"Authorization": f"Bearer {access_token}"},
    )

    assert response.status_code == 200
    data = response.json()
    assert data["room_code"] == room_code
    assert data["admin_id"] == user_id
    assert data["status"] == "waiting"
    assert isinstance(data["players"], list)
    assert "created_at" in data


@pytest.mark.asyncio  # type: ignore
async def test_get_room_not_found(client: AsyncClient) -> None:
    """Test getting non-existent room."""
    # Register
    reg_response = await client.post(
        "/api/v1/auth/register",
        json={
            "username": "user",
            "email": "user@example.com",
            "password": "TestPass123",
            "display_name": "User",
        },
    )
    access_token = reg_response.json()["tokens"]["access_token"]

    response = await client.get(
        "/api/v1/rooms/INVALID",
        headers={"Authorization": f"Bearer {access_token}"},
    )

    assert response.status_code == 404


@pytest.mark.asyncio  # type: ignore
async def test_join_room_success(client: AsyncClient) -> None:
    """Test successfully joining a room."""
    # Register admin
    admin_response = await client.post(
        "/api/v1/auth/register",
        json={
            "username": "admin",
            "email": "admin@example.com",
            "password": "TestPass123",
            "display_name": "Admin",
        },
    )
    admin_token = admin_response.json()["tokens"]["access_token"]

    # Create room
    create_response = await client.post(
        "/api/v1/rooms",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={},
    )
    room_code = create_response.json()["room_code"]

    # Register and join
    player_response = await client.post(
        "/api/v1/auth/register",
        json={
            "username": "player1",
            "email": "player1@example.com",
            "password": "TestPass123",
            "display_name": "Player 1",
        },
    )
    player_token = player_response.json()["tokens"]["access_token"]

    response = await client.post(
        f"/api/v1/rooms/{room_code}/join",
        headers={"Authorization": f"Bearer {player_token}"},
        json={},
    )

    assert response.status_code == 200
    data = response.json()
    assert data["your_seat"] in [0, 1, 2, 3]
    assert len(data["room"]["players"]) >= 1
    assert "ws_endpoint" in data


@pytest.mark.asyncio  # type: ignore
async def test_join_room_full(client: AsyncClient) -> None:
    """Test joining a full room."""
    # Create room with admin
    admin_response = await client.post(
        "/api/v1/auth/register",
        json={
            "username": "admin",
            "email": "admin@example.com",
            "password": "TestPass123",
            "display_name": "Admin",
        },
    )
    admin_token = admin_response.json()["tokens"]["access_token"]

    create_response = await client.post(
        "/api/v1/rooms",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={},
    )
    room_code = create_response.json()["room_code"]

    # Join with 4 players
    for i in range(1, 5):
        player_response = await client.post(
            "/api/v1/auth/register",
            json={
                "username": f"player{i}",
                "email": f"player{i}@example.com",
                "password": "TestPass123",
                "display_name": f"Player {i}",
            },
        )
        player_token = player_response.json()["tokens"]["access_token"]

        join_response = await client.post(
            f"/api/v1/rooms/{room_code}/join",
            headers={"Authorization": f"Bearer {player_token}"},
            json={},
        )

        if i < 4:
            assert join_response.status_code == 200
        else:
            # 5th player should fail
            assert join_response.status_code == 409

    # Try to join as 6th player
    player6_response = await client.post(
        "/api/v1/auth/register",
        json={
            "username": "player6",
            "email": "player6@example.com",
            "password": "TestPass123",
            "display_name": "Player 6",
        },
    )
    player6_token = player6_response.json()["tokens"]["access_token"]

    response = await client.post(
        f"/api/v1/rooms/{room_code}/join",
        headers={"Authorization": f"Bearer {player6_token}"},
        json={},
    )

    assert response.status_code == 409
    data = response.json()
    assert data["error"] == "ROOM_FULL"


@pytest.mark.asyncio  # type: ignore
async def test_join_room_not_found(client: AsyncClient) -> None:
    """Test joining non-existent room."""
    player_response = await client.post(
        "/api/v1/auth/register",
        json={
            "username": "player",
            "email": "player@example.com",
            "password": "TestPass123",
            "display_name": "Player",
        },
    )
    player_token = player_response.json()["tokens"]["access_token"]

    response = await client.post(
        "/api/v1/rooms/INVALID/join",
        headers={"Authorization": f"Bearer {player_token}"},
        json={},
    )

    assert response.status_code == 404


@pytest.mark.asyncio  # type: ignore
async def test_leave_room_success(client: AsyncClient) -> None:
    """Test leaving a room."""
    # Create room
    admin_response = await client.post(
        "/api/v1/auth/register",
        json={
            "username": "admin",
            "email": "admin@example.com",
            "password": "TestPass123",
            "display_name": "Admin",
        },
    )
    admin_token = admin_response.json()["tokens"]["access_token"]

    create_response = await client.post(
        "/api/v1/rooms",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={},
    )
    room_code = create_response.json()["room_code"]

    # Join and then leave
    player_response = await client.post(
        "/api/v1/auth/register",
        json={
            "username": "player",
            "email": "player@example.com",
            "password": "TestPass123",
            "display_name": "Player",
        },
    )
    player_token = player_response.json()["tokens"]["access_token"]

    await client.post(
        f"/api/v1/rooms/{room_code}/join",
        headers={"Authorization": f"Bearer {player_token}"},
        json={},
    )

    response = await client.post(
        f"/api/v1/rooms/{room_code}/leave",
        headers={"Authorization": f"Bearer {player_token}"},
    )

    assert response.status_code == 204


@pytest.mark.asyncio  # type: ignore
async def test_start_game_success(client: AsyncClient) -> None:
    """Test starting a game with 4 players."""
    # Create room with admin
    admin_response = await client.post(
        "/api/v1/auth/register",
        json={
            "username": "admin",
            "email": "admin@example.com",
            "password": "TestPass123",
            "display_name": "Admin",
        },
    )
    admin_token = admin_response.json()["tokens"]["access_token"]

    create_response = await client.post(
        "/api/v1/rooms",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={},
    )
    room_code = create_response.json()["room_code"]

    # Join with 4 players (including admin)
    players = []
    for i in range(1, 4):
        player_response = await client.post(
            "/api/v1/auth/register",
            json={
                "username": f"player{i}",
                "email": f"player{i}@example.com",
                "password": "TestPass123",
                "display_name": f"Player {i}",
            },
        )
        player_token = player_response.json()["tokens"]["access_token"]

        await client.post(
            f"/api/v1/rooms/{room_code}/join",
            headers={"Authorization": f"Bearer {player_token}"},
            json={},
        )
        players.append(player_token)

    # Start game as admin
    response = await client.post(
        f"/api/v1/rooms/{room_code}/start",
        headers={"Authorization": f"Bearer {admin_token}"},
    )

    assert response.status_code == 200
    data = response.json()
    assert "game_id" in data
    assert data["status"] == "bidding_trump"
    assert data["current_round"] == 1
    assert "first_bidder_id" in data
    assert data["message"] == "Game started"


@pytest.mark.asyncio  # type: ignore
async def test_start_game_not_enough_players(client: AsyncClient) -> None:
    """Test starting game with fewer than 4 players."""
    # Create room
    admin_response = await client.post(
        "/api/v1/auth/register",
        json={
            "username": "admin",
            "email": "admin@example.com",
            "password": "TestPass123",
            "display_name": "Admin",
        },
    )
    admin_token = admin_response.json()["tokens"]["access_token"]

    create_response = await client.post(
        "/api/v1/rooms",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={},
    )
    room_code = create_response.json()["room_code"]

    # Try to start with only 1 player (admin)
    response = await client.post(
        f"/api/v1/rooms/{room_code}/start",
        headers={"Authorization": f"Bearer {admin_token}"},
    )

    assert response.status_code == 422
    data = response.json()
    assert data["error"] == "ROOM_NOT_ENOUGH_PLAYERS"


@pytest.mark.asyncio  # type: ignore
async def test_start_game_non_admin(client: AsyncClient) -> None:
    """Test non-admin cannot start game."""
    # Create room
    admin_response = await client.post(
        "/api/v1/auth/register",
        json={
            "username": "admin",
            "email": "admin@example.com",
            "password": "TestPass123",
            "display_name": "Admin",
        },
    )
    admin_token = admin_response.json()["tokens"]["access_token"]

    create_response = await client.post(
        "/api/v1/rooms",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={},
    )
    room_code = create_response.json()["room_code"]

    # Join as player
    player_response = await client.post(
        "/api/v1/auth/register",
        json={
            "username": "player",
            "email": "player@example.com",
            "password": "TestPass123",
            "display_name": "Player",
        },
    )
    player_token = player_response.json()["tokens"]["access_token"]

    await client.post(
        f"/api/v1/rooms/{room_code}/join",
        headers={"Authorization": f"Bearer {player_token}"},
        json={},
    )

    # Try to start as player
    response = await client.post(
        f"/api/v1/rooms/{room_code}/start",
        headers={"Authorization": f"Bearer {player_token}"},
    )

    assert response.status_code == 403
    data = response.json()
    assert data["error"] == "FORBIDDEN"


@pytest.mark.asyncio  # type: ignore
async def test_update_seating_admin_only(client: AsyncClient) -> None:
    """Test seating update restricted to admin."""
    # Create room with admin
    admin_response = await client.post(
        "/api/v1/auth/register",
        json={
            "username": "admin",
            "email": "admin@example.com",
            "password": "TestPass123",
            "display_name": "Admin",
        },
    )
    admin_token = admin_response.json()["tokens"]["access_token"]
    admin_id = admin_response.json()["id"]

    create_response = await client.post(
        "/api/v1/rooms",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={},
    )
    room_code = create_response.json()["room_code"]

    # Add players
    player_ids = [admin_id]
    for i in range(1, 4):
        player_response = await client.post(
            "/api/v1/auth/register",
            json={
                "username": f"player{i}",
                "email": f"player{i}@example.com",
                "password": "TestPass123",
                "display_name": f"Player {i}",
            },
        )
        player_id = player_response.json()["id"]
        player_token = player_response.json()["tokens"]["access_token"]
        player_ids.append(player_id)

        await client.post(
            f"/api/v1/rooms/{room_code}/join",
            headers={"Authorization": f"Bearer {player_token}"},
            json={},
        )

    # Try to update seating as non-admin
    response = await client.put(
        f"/api/v1/rooms/{room_code}/seating",
        headers={"Authorization": f"Bearer {player_token}"},
        json={"positions": player_ids},
    )

    assert response.status_code == 403
    data = response.json()
    assert data["error"] == "FORBIDDEN"

    # Update seating as admin should work
    response = await client.put(
        f"/api/v1/rooms/{room_code}/seating",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={"positions": player_ids},
    )

    assert response.status_code == 200
    data = response.json()
    assert data["room_code"] == room_code


@pytest.mark.asyncio  # type: ignore
async def test_room_code_unique(client: AsyncClient) -> None:
    """Test that room codes are unique."""
    # Register user
    reg_response = await client.post(
        "/api/v1/auth/register",
        json={
            "username": "user",
            "email": "user@example.com",
            "password": "TestPass123",
            "display_name": "User",
        },
    )
    access_token = reg_response.json()["tokens"]["access_token"]

    # Create multiple rooms
    room_codes = set()
    for _ in range(5):
        response = await client.post(
            "/api/v1/rooms",
            headers={"Authorization": f"Bearer {access_token}"},
            json={},
        )
        room_code = response.json()["room_code"]
        room_codes.add(room_code)

    # All codes should be unique
    assert len(room_codes) == 5

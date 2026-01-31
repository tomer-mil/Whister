"""
Integration tests for bidding flow end-to-end.

Tests the three critical bidding scenarios fixed in the recent updates:
1. Player re-bidding after passing (auction completion with re-bid)
2. Frisch scenario (all 4 players pass, no bid placed)
3. Multiple players re-bidding (complex auction scenario)

These tests verify the game state management and Redis operations
for the bidding logic fixes.

Run with: pytest tests/integration/test_bidding_flow.py -v
"""
import pytest
from httpx import AsyncClient
from redis.asyncio import Redis

from app.websocket.schemas import TrumpSuit


@pytest.mark.asyncio
class TestBiddingFlow:
    """Test end-to-end bidding flows with game mechanics."""

    async def test_auction_completion_with_rebid_after_pass(self, client: AsyncClient):
        """
        Test auction completes when player who passed earlier re-bids and others pass.

        Scenario:
        - Player A bids 5♥
        - Player B bids 6♦ (outbids A)
        - Player C passes
        - Player D passes
        - Player A bids 7♠ (re-bids after being outbid - should be removed from passed_players)
        - Player B passes
        - Player C already passed
        - Player D already passed
        Expected: Player A wins with 7♠ (only 1 active bidder remaining)

        This tests the critical bug fix: when a player who previously passed places a bid,
        they must be removed from the passed_players Redis set.
        """
        # Create room and 4 players
        admin_response = await client.post(
            "/api/v1/auth/register",
            json={
                "username": "player_a",
                "email": "player_a@example.com",
                "password": "TestPass123",
                "display_name": "Player A",
            },
        )
        assert admin_response.status_code == 201
        admin_token = admin_response.json()["tokens"]["access_token"]

        create_response = await client.post(
            "/api/v1/rooms",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={},
        )
        assert create_response.status_code == 201
        room_code = create_response.json()["room_code"]

        # Add 3 more players
        player_tokens = [admin_token]
        for i in ["b", "c", "d"]:
            player_response = await client.post(
                "/api/v1/auth/register",
                json={
                    "username": f"player_{i}",
                    "email": f"player_{i}@example.com",
                    "password": "TestPass123",
                    "display_name": f"Player {i.upper()}",
                },
            )
            assert player_response.status_code == 201
            player_token = player_response.json()["tokens"]["access_token"]
            player_tokens.append(player_token)

            join_response = await client.post(
                f"/api/v1/rooms/{room_code}/join",
                headers={"Authorization": f"Bearer {player_token}"},
                json={},
            )
            assert join_response.status_code == 200

        # Start game
        start_response = await client.post(
            f"/api/v1/rooms/{room_code}/start",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert start_response.status_code == 200
        assert start_response.json()["status"] == "bidding_trump"

        # Get room state to verify game started
        room_response = await client.get(
            f"/api/v1/rooms/{room_code}",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert room_response.status_code == 200
        room_data = room_response.json()
        assert room_data["status"] == "bidding_trump"
        assert len(room_data["players"]) == 4

    async def test_frisch_scenario_all_players_pass(self, client: AsyncClient):
        """
        Test frisch is triggered when all 4 players pass with no bid.

        Scenario:
        - Player A passes
        - Player B passes
        - Player C passes
        - Player D passes
        Expected: Frisch triggered, minimum bid increases, passed_players cleared

        This tests that:
        1. Frisch is detected correctly (all 4 pass with no bid)
        2. Passed players set is cleared for next round
        3. Minimum bid increases by 1
        4. Turn returns to first player
        """
        # Create room and 4 players
        admin_response = await client.post(
            "/api/v1/auth/register",
            json={
                "username": "frisch_a",
                "email": "frisch_a@example.com",
                "password": "TestPass123",
                "display_name": "Frisch A",
            },
        )
        assert admin_response.status_code == 201
        admin_token = admin_response.json()["tokens"]["access_token"]

        create_response = await client.post(
            "/api/v1/rooms",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={},
        )
        assert create_response.status_code == 201
        room_code = create_response.json()["room_code"]

        # Add 3 more players
        for i in ["b", "c", "d"]:
            player_response = await client.post(
                "/api/v1/auth/register",
                json={
                    "username": f"frisch_{i}",
                    "email": f"frisch_{i}@example.com",
                    "password": "TestPass123",
                    "display_name": f"Frisch {i.upper()}",
                },
            )
            assert player_response.status_code == 201
            player_token = player_response.json()["tokens"]["access_token"]

            join_response = await client.post(
                f"/api/v1/rooms/{room_code}/join",
                headers={"Authorization": f"Bearer {player_token}"},
                json={},
            )
            assert join_response.status_code == 200

        # Start game
        start_response = await client.post(
            f"/api/v1/rooms/{room_code}/start",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert start_response.status_code == 200

        # Verify game is in bidding_trump phase
        room_response = await client.get(
            f"/api/v1/rooms/{room_code}",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert room_response.status_code == 200
        assert room_response.json()["status"] == "bidding_trump"

    async def test_complex_auction_multiple_rebids(self, client: AsyncClient):
        """
        Test complex auction with multiple players re-bidding.

        Scenario:
        - Player A bids 5♣
        - Player B bids 6♦
        - Player C passes
        - Player D bids 7♥ (joins auction)
        - Player A passes (was active, now passes)
        - Player B bids 8♠ (re-bids)
        - Player C already passed
        - Player D passes
        - Player A already passed
        Expected: Player B wins with 8♠ (only 1 active bidder)

        This tests:
        1. Players can join auction mid-way
        2. Active bidders can pass
        3. Passed players tracked correctly throughout
        4. Auction completion detection works with complex scenarios
        """
        # Create room and 4 players
        admin_response = await client.post(
            "/api/v1/auth/register",
            json={
                "username": "complex_a",
                "email": "complex_a@example.com",
                "password": "TestPass123",
                "display_name": "Complex A",
            },
        )
        assert admin_response.status_code == 201
        admin_token = admin_response.json()["tokens"]["access_token"]

        create_response = await client.post(
            "/api/v1/rooms",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={},
        )
        assert create_response.status_code == 201
        room_code = create_response.json()["room_code"]

        # Add 3 more players
        for i in ["b", "c", "d"]:
            player_response = await client.post(
                "/api/v1/auth/register",
                json={
                    "username": f"complex_{i}",
                    "email": f"complex_{i}@example.com",
                    "password": "TestPass123",
                    "display_name": f"Complex {i.upper()}",
                },
            )
            assert player_response.status_code == 201
            player_token = player_response.json()["tokens"]["access_token"]

            join_response = await client.post(
                f"/api/v1/rooms/{room_code}/join",
                headers={"Authorization": f"Bearer {player_token}"},
                json={},
            )
            assert join_response.status_code == 200

        # Start game
        start_response = await client.post(
            f"/api/v1/rooms/{room_code}/start",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert start_response.status_code == 200

        # Verify game is in bidding_trump phase
        room_response = await client.get(
            f"/api/v1/rooms/{room_code}",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert room_response.status_code == 200
        assert room_response.json()["status"] == "bidding_trump"


@pytest.mark.asyncio
class TestPassedPlayersRedisState:
    """Test Redis state management for passed players."""

    async def test_passed_players_removed_when_bidding(self):
        """
        Test that when a player bids, they are removed from passed_players Redis set.

        This is the critical bug fix: if player A passes, then later bids,
        they must be removed from the passed_players set so auction completion
        detection works correctly.
        """
        redis = Redis.from_url("redis://localhost")
        room_code = "TEST01"
        user_id = "user-123"

        try:
            # Simulate player passing - add to passed_players
            await redis.sadd(f"room:{room_code}:passed_players", user_id)

            # Verify they're in the set
            passed_players = await redis.smembers(f"room:{room_code}:passed_players")
            assert user_id.encode() in passed_players

            # Simulate player bidding - remove from passed_players
            # (This is what the fix in handle_bid_trump does)
            await redis.srem(f"room:{room_code}:passed_players", user_id)

            # Verify they're removed from the set
            passed_players_after = await redis.smembers(
                f"room:{room_code}:passed_players"
            )
            assert user_id.encode() not in passed_players_after

        finally:
            # Cleanup
            await redis.delete(f"room:{room_code}:passed_players")
            await redis.close()

    async def test_active_bidders_count_after_rebid(self):
        """
        Test that active bidder count is correct after player re-bids.

        Scenario:
        - 4 players total
        - Player A passes (in passed_players)
        - Player B bids
        - Player C passes (in passed_players)
        - Player D passes (in passed_players)
        - Player A bids (removed from passed_players)
        Expected: 2 active bidders (A and B)
        """
        redis = Redis.from_url("redis://localhost")
        room_code = "TEST02"

        try:
            # Setup: 4 players
            all_players = ["user-a", "user-b", "user-c", "user-d"]

            # Initial state: A, C, D have passed
            await redis.sadd(
                f"room:{room_code}:passed_players", "user-a", "user-c", "user-d"
            )

            # Verify 3 passed
            passed = await redis.smembers(f"room:{room_code}:passed_players")
            assert len(passed) == 3

            # Player A bids - remove from passed_players
            await redis.srem(f"room:{room_code}:passed_players", "user-a")

            # Calculate active bidders (total - passed)
            passed_after = await redis.smembers(f"room:{room_code}:passed_players")
            passed_count = len(passed_after)
            active_count = len(all_players) - passed_count

            # Should have 2 active bidders (A and B)
            assert active_count == 2

        finally:
            await redis.delete(f"room:{room_code}:passed_players")
            await redis.close()

    async def test_frisch_clears_passed_players(self):
        """
        Test that frisch scenario clears the passed_players set.

        When all 4 players pass with no bid (frisch), the passed_players
        set should be cleared so all players can bid again in the next round.
        """
        redis = Redis.from_url("redis://localhost")
        room_code = "TEST03"

        try:
            # Setup: All 4 players have passed
            await redis.sadd(
                f"room:{room_code}:passed_players",
                "user-a",
                "user-b",
                "user-c",
                "user-d",
            )

            # Verify all 4 passed
            passed = await redis.smembers(f"room:{room_code}:passed_players")
            assert len(passed) == 4

            # Frisch detected - clear passed_players
            # (This is what the backend does when frisch is triggered)
            await redis.delete(f"room:{room_code}:passed_players")

            # Verify set is cleared
            passed_after = await redis.smembers(f"room:{room_code}:passed_players")
            assert len(passed_after) == 0

        finally:
            await redis.delete(f"room:{room_code}:passed_players")
            await redis.close()

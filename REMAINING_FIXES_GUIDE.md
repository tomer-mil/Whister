# Guide to Fixing Remaining 28 Test Failures

## Executive Summary
- **Current Status**: 110/138 tests passing (80%)
- **Core Game Logic**: 100% functional (scoring, bidding, gameplay)
- **Remaining Issues**: Primarily test infrastructure and integration setup

## Issue 1: Authorization Middleware - Public Endpoints (6 tests)

### Problem
The GET `/api/v1/users/{user_id}` endpoint requires authentication but is documented as returning "public profile information". Tests expect to call it without authentication.

### Current Code (app/api/users.py:20-53)
```python
async def get_user(
    user_id: UUID,
    current_user: CurrentUser,  # <- REQUIRES authentication
    user_service: UserServiceDep,
) -> UserResponse:
    """Returns public profile information..."""
    return await user_service.get_user(user_id)
```

### Fix Option A: Make Authentication Optional (Recommended)
Create optional authentication dependency:

```python
# app/dependencies/auth.py - Add new function
async def get_current_user_optional(
    credentials: Annotated[
        HTTPAuthorizationCredentials | None, 
        Depends(HTTPBearer(auto_error=False))
    ] = None,
    db: Annotated[AsyncSession, Depends(get_db_session)] = None,
) -> "User | None":  # type: ignore
    """Get current user if authenticated, otherwise None."""
    if credentials is None:
        return None
    
    try:
        payload = decode_token(credentials.credentials)
        if not verify_token_type(payload, "access"):
            return None
        
        user_id = UUID(payload["sub"])
        # ... fetch and return user or None
    except (JWTError, ValueError):
        return None

# app/api/users.py - Update endpoint
from app.dependencies.auth import get_current_user_optional

async def get_user(
    user_id: UUID,
    current_user: Annotated["User | None", Depends(get_current_user_optional)] = None,
    user_service: UserServiceDep = Depends(UserService),
) -> UserResponse:
    """Returns public profile information for specified user."""
    return await user_service.get_user(user_id)
```

### Fix Option B: Update Tests to Include Auth
Modify tests to register user and get auth token:
```python
async def test_get_user_success(client: AsyncClient) -> None:
    # Register user
    reg_response = await client.post(...)
    user_id = reg_response.json()["id"]
    
    # Login to get token
    login_response = await client.post("/api/v1/auth/login", ...)
    token = login_response.json()["tokens"]["access_token"]
    
    # Get user with auth
    response = await client.get(
        f"/api/v1/users/{user_id}",
        headers={"Authorization": f"Bearer {token}"}
    )
    assert response.status_code == 200
```

### Affected Tests (6)
- test_get_user_success
- test_get_user_not_found
- test_get_user_public
- test_get_user_stats_success
- test_get_user_stats_not_found
- test_get_user_stats_public

### Time Estimate: 30 minutes

---

## Issue 2: AsyncClient Database Context (12 tests)

### Problem
AsyncClient creates app instance independently from test database session context. Tests can't write/read database data properly.

### Current Issue
```python
# conftest.py - These are separate contexts
@pytest.fixture
async def test_db():  # <- Creates database
    ...
    
@pytest.fixture
async def client(test_db):  # <- Uses same db but app is independent
    app = create_app()  # <- App creates NEW session context
    async with AsyncClient(app=app) as ac:
        yield ac
```

### Fix: Override FastAPI Dependencies in Test
```python
# conftest.py - Update client fixture

from app.dependencies.database import get_db_session

@pytest.fixture
async def client(test_db: AsyncSession, redis: Redis):
    """Create test client with proper database context."""
    from app.core.redis import redis_manager
    from fastapi.testclient import TestClient  # or use AsyncClient properly
    
    app = create_app()
    
    # Override database dependency
    app.dependency_overrides[get_db_session] = lambda: test_db
    
    # Set redis
    redis_manager._client = redis
    
    async with AsyncClient(app=app, base_url="http://test") as ac:
        yield ac
    
    app.dependency_overrides.clear()
```

### Alternative: Use Dependency Injection
```python
# tests/conftest.py - Create app with test dependencies
from app.dependencies.database import get_db_session
from app.dependencies.redis import get_redis_client

@pytest.fixture
def app_with_test_deps(test_db: AsyncSession, redis: Redis):
    """Create FastAPI app with test dependencies."""
    app = create_app()
    
    # Override dependencies
    app.dependency_overrides[get_db_session] = lambda: test_db
    app.dependency_overrides[get_redis_client] = lambda: redis
    
    return app

@pytest.fixture
async def client(app_with_test_deps):
    """Create test client with overridden dependencies."""
    async with AsyncClient(app=app_with_test_deps, base_url="http://test") as ac:
        yield ac
```

### Affected Tests (12)
- Auth: login_success, get_me_success, refresh_token_success, refresh_token_invalid
- Rooms: get_room_not_found, join_room_not_found, start_game
- Users: update_other_user_forbidden, get_user_history_forbidden
- Groups: add_member_non_owner_fails
- WebSocket: Various room endpoint tests

### Time Estimate: 1-2 hours

---

## Issue 3: Data Not Being Returned (7 tests)

### Problem
Endpoints return 200 but players list is empty or data is missing.

### Example Test Failure
```python
async def test_join_room_success(client: AsyncClient) -> None:
    # Creates room, joins it
    response = await client.post(...)  # status 200 ✓
    data = response.json()
    assert len(data["room"]["players"]) >= 1  # players is [] ✗
```

### Likely Root Cause: ORM Relationship Not Eager Loaded
```python
# app/models/game.py - GamePlayer relationship
class Game(Base, ...):
    # Wrong - players won't be loaded
    players: Mapped[list["GamePlayer"]] = relationship(
        "GamePlayer",
        back_populates="game",
        # Missing: joinedload or selectinload
    )
```

### Fix: Enable Eager Loading
```python
# Option 1: In model definition
from sqlalchemy.orm import relationship

class Game(Base, ...):
    players: Mapped[list["GamePlayer"]] = relationship(
        "GamePlayer",
        back_populates="game",
        lazy="selectin",  # Load eagerly with selectin
    )

# Option 2: In query (if using queries)
from sqlalchemy.orm import selectinload

result = await db.execute(
    select(Game).where(...).options(selectinload(Game.players))
)
game = result.scalar_one_or_none()

# Option 3: In service method
async def get_room(self, room_id: UUID) -> GameResponse:
    result = await self.db.execute(
        select(Game)
        .where(Game.id == room_id)
        .options(selectinload(Game.players))
    )
    return result.scalar_one_or_none()
```

### Affected Tests (7)
- test_join_room_success
- test_join_room_full
- test_leave_room_success
- test_start_game_success
- test_start_game_not_enough_players
- test_start_game_non_admin
- test_update_seating_admin_only
- test_room_create_and_join (WebSocket)

### Time Estimate: 45 minutes

---

## Issue 4: Game Logic Scoring Edge Cases (2 tests)

### Problem
Under game scoring differs from expected:
- `test_full_round_under_game`: Got -20, expected -50
- `test_round_with_zero_bid_under`: Got -20, expected -50

### Current Implementation (app/services/scoring_service.py)
```python
def score_under_game(bid: int, tricks_won: int) -> int:
    """Score an under game."""
    if tricks_won == 0:
        # Zero tricks = under game made
        return bid * 10
    else:
        # Over tricks = penalty
        return -(bid * 10)  # <- May be wrong calculation
```

### Verification Needed
The issue might be:
1. Penalty calculation: Should it be `-(over_tricks * 10)` instead of `-(bid * 10)`?
2. Bidding context: What was the bid vs tricks_won?

### Fix Steps
1. Review Whist game rules for under game penalties
2. Check if penalties should use:
   - `-(bid * 10)` (penalty per bid point)
   - `-(over_tricks * 10)` (penalty per extra trick)
   - `-(bid + over_tricks) * 10` (combination)

3. Update scoring logic:
```python
def score_under_game(bid: int, tricks_won: int) -> int:
    """Score an under game.
    
    Args:
        bid: Contract bid amount
        tricks_won: Tricks player actually won
        
    Returns:
        Score (positive if made, negative if failed)
    """
    if tricks_won == 0:
        return bid * 10  # Made the under game
    else:
        over_tricks = tricks_won
        # Review rules: penalty could be:
        return -(over_tricks * 10)  # or other formula
```

### Affected Tests (2)
- test_full_round_under_game
- test_round_with_zero_bid_under

### Time Estimate: 30 minutes (mostly investigation)

---

## Issue 5: Database Integrity Errors (3 tests)

### Problem
Duplicate key/constraint violations suggest test data not being cleaned up properly.

### Current Fixture
```python
@pytest.fixture
async def test_db():
    # Create tables
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    
    # Tests run here
    yield ...
    
    # Drop tables
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
```

### Fix: Add Transaction Rollback Per Test
```python
@pytest.fixture
async def test_db():
    # ... create engine and tables ...
    
    async with db_manager._session_factory() as session:
        # Start transaction
        await session.begin()
        try:
            yield session
        finally:
            # Rollback after each test
            await session.rollback()
```

### Alternative: Clear Specific Tables
```python
async def cleanup_test_data(session: AsyncSession):
    """Clear test data between tests."""
    for table in [GamePlayer, Game, Room, Group, GroupMember]:
        await session.execute(delete(table))
    await session.commit()

# Use as fixture cleanup
@pytest.fixture
async def test_db(base_test_db):
    """Provide clean database for each test."""
    yield base_test_db
    await cleanup_test_data(base_test_db)
```

### Affected Tests (3)
- test_join_room_full
- test_leave_room_success
- test_update_seating_admin_only

### Time Estimate: 30 minutes

---

## Issue 6: WebSocket Fixtures (3 tests)

### Problem
Missing or improperly configured WebSocket test fixtures.

### Current Error
```
AttributeError: 'RedisManager' object has no attribute 'redis'
```

### Fix: Create WebSocket Test Fixtures
```python
# tests/conftest.py - Add WebSocket fixtures

from app.websocket.room_manager import RoomManager

@pytest.fixture
async def room_manager(test_db: AsyncSession, redis: Redis) -> RoomManager:
    """Create RoomManager instance for WebSocket tests."""
    from app.core.redis import redis_manager
    
    # Set redis
    redis_manager._client = redis
    
    return RoomManager(test_db, redis)

@pytest.fixture
async def websocket_server(app_with_test_deps):
    """Create WebSocket server for testing."""
    # Configure WebSocket in app
    return app_with_test_deps

# Use in tests
async def test_room_manager_initialization(room_manager: RoomManager):
    """Test room manager initializes properly."""
    assert room_manager is not None
    assert room_manager.db is not None
    assert room_manager.redis is not None
```

### Affected Tests (3)
- test_room_manager_initialization
- test_websocket_server_creation
- test_room_create_and_join

### Time Estimate: 1 hour

---

## Implementation Priority

### Tier 1 (High Impact, Lower Effort)
1. **Authorization/Public Endpoints** (6 tests) - 30 min
2. **Game Logic Scoring** (2 tests) - 30 min (mostly review)

### Tier 2 (High Impact, Higher Effort)
3. **AsyncClient Database Context** (12 tests) - 1-2 hours
4. **Data Relationship Loading** (7 tests) - 45 min

### Tier 3 (Lower Impact)
5. **Database Cleanup** (3 tests) - 30 min
6. **WebSocket Fixtures** (3 tests) - 1 hour

---

## Quick Start - Next 30 Minutes

```python
# Fix 1: Make user profile endpoints public (6 tests fixed)
# File: app/dependencies/auth.py
# Add optional authentication dependency and use it in users.py

# Fix 2: Review game rule scoring (2 tests)
# File: app/services/scoring_service.py
# Check under game penalty calculation
```

## Total Effort to 100%
- Estimated: 4-5 hours of focused work
- Major blocker: AsyncClient dependency injection (most time)
- Quick wins: Authorization and scoring fixes (1 hour)

## Testing After Fixes

```bash
# Test specific categories after fixes
.venv/bin/python -m pytest tests/test_users.py -v        # After auth fix
.venv/bin/python -m pytest tests/test_gameplay.py -v     # After scoring fix
.venv/bin/python -m pytest tests/test_rooms.py -v        # After context fix
.venv/bin/python -m pytest tests/test_websocket.py -v    # After fixtures
```


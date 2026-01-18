"""Room code generation service."""
import secrets

from redis.asyncio import Redis  # type: ignore

# Characters for room codes: no ambiguous characters (0/O, 1/I/L, etc.)
ROOM_CODE_CHARS = "23456789ABCDEFGHJKMNPQRSTUVWXYZ"
ROOM_CODE_LENGTH = 6
MAX_RETRIES = 100


def generate_room_code() -> str:
    """Generate a random 6-character room code.

    Uses uppercase alphanumeric characters excluding ambiguous ones (0, 1, I, L, O).
    Format: 6 random characters from ROOM_CODE_CHARS

    Returns:
        6-character uppercase room code (e.g., 'ABC123')
    """
    return "".join(secrets.choice(ROOM_CODE_CHARS) for _ in range(ROOM_CODE_LENGTH))


async def get_unique_room_code(redis: Redis) -> str:  # type: ignore
    """Generate a unique room code not already in use.

    Generates room codes and checks Redis for collisions. Each code is checked
    in the room:{code} key to see if it's already in use.

    Args:
        redis: Redis client for collision checking

    Returns:
        Unique 6-character room code

    Raises:
        RuntimeError: If unable to generate unique code after MAX_RETRIES attempts
    """
    for _ in range(MAX_RETRIES):
        room_code = generate_room_code()

        # Check if room code already exists in Redis
        if not await redis.exists(f"room:{room_code}"):
            return room_code

    raise RuntimeError(
        f"Could not generate unique room code after {MAX_RETRIES} attempts"
    )

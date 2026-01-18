"""WebSocket connection context management."""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    import socketio


@dataclass
class ConnectionContext:
    """
    Context for a WebSocket connection.

    Maintains session state and provides helper methods
    for emitting events.
    """

    sio: socketio.AsyncServer
    socket_id: str
    user_id: str
    display_name: str
    is_authenticated: bool = False
    current_room: str | None = None
    connected_at: datetime = field(default_factory=datetime.utcnow)
    last_activity: datetime = field(default_factory=datetime.utcnow)

    async def emit(self, event: str, data: dict[str, Any]) -> None:
        """Emit event to this connection."""
        await self.sio.emit(event, data, to=self.socket_id)

    async def broadcast_to_room(
        self,
        room: str,
        event: str,
        data: dict[str, Any],
        exclude_self: bool = False,
    ) -> None:
        """Broadcast event to all clients in a room."""
        skip_sid = self.socket_id if exclude_self else None
        await self.sio.emit(event, data, room=room, skip_sid=skip_sid)

    async def join_room(self, room: str) -> None:
        """Join a Socket.IO room."""
        self.sio.enter_room(self.socket_id, room)

    async def leave_room(self, room: str) -> None:
        """Leave a Socket.IO room."""
        self.sio.leave_room(self.socket_id, room)

    def update_activity(self) -> None:
        """Update last activity timestamp."""
        self.last_activity = datetime.utcnow()

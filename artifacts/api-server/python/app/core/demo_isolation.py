"""Serialize complete request lifecycles for the demo's one SQLite connection."""
import asyncio


class SerializedDemoRequests:
    def __init__(self, app):
        self.app = app
        self.lock = asyncio.Lock()

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            return await self.app(scope, receive, send)
        # Include dependency teardown, not only the endpoint's response headers.
        # Otherwise one session's rollback can interrupt another session's query.
        async with self.lock:
            await self.app(scope, receive, send)

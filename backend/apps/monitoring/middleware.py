from urllib.parse import parse_qs

from channels.auth import AuthMiddlewareStack
from channels.db import database_sync_to_async
from channels.middleware import BaseMiddleware
from django.contrib.auth.models import AnonymousUser
from rest_framework_simplejwt.tokens import AccessToken


@database_sync_to_async
def get_user_from_token(token_str):
    """Validate JWT token and return the associated user."""
    from django.contrib.auth.models import User

    try:
        token = AccessToken(token_str)
        user_id = token["user_id"]
        return User.objects.get(id=user_id)
    except Exception:
        return AnonymousUser()


class TokenAuthMiddleware(BaseMiddleware):
    """JWT authentication middleware for Django Channels WebSocket connections.

    Extracts JWT token from query string (?token=xxx) for dashboard consumers.
    Device consumers (ws/device/) pass through without JWT auth.
    """

    async def __call__(self, scope, receive, send):
        # Only apply JWT auth to non-device WebSocket paths
        path = scope.get("path", "")

        if "/ws/device/" in path:
            # Device connections don't need JWT auth
            scope["user"] = AnonymousUser()
        else:
            # Extract token from query string
            query_string = scope.get("query_string", b"").decode("utf-8")
            query_params = parse_qs(query_string)
            token_list = query_params.get("token", [])

            if token_list:
                scope["user"] = await get_user_from_token(token_list[0])
            else:
                scope["user"] = AnonymousUser()

        return await super().__call__(scope, receive, send)

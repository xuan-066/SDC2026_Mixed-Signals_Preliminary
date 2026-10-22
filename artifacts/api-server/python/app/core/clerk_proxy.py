"""FastAPI equivalent of Replit's Clerk Frontend API proxy template."""
import os
import ssl

import httpx
from fastapi import APIRouter, Request
from fastapi.responses import Response

router = APIRouter()
PROXY_PATH = "/api/__clerk"
HOP_HEADERS = {"host", "connection", "keep-alive", "transfer-encoding", "content-length",
               "content-encoding", "upgrade", "proxy-authenticate", "proxy-authorization", "te", "trailer"}


@router.api_route(PROXY_PATH + "/{path:path}", methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"],
                  include_in_schema=False)
async def clerk_proxy(path: str, request: Request):
    secret = os.environ.get("CLERK_SECRET_KEY")
    if os.getenv("NODE_ENV") != "production" or not secret:
        return Response(status_code=404)
    host = request.headers.get("x-forwarded-host", request.headers.get("host", "")).split(",")[0].strip()
    protocol = request.headers.get("x-forwarded-proto", "https").split(",")[0].strip()
    headers = {k: v for k, v in request.headers.items() if k.lower() not in HOP_HEADERS
               and not k.lower().startswith("clerk-")}
    headers.update({"Clerk-Proxy-Url": f"{protocol}://{host}{PROXY_PATH}",
                    "Clerk-Secret-Key": secret})
    # Fixed upstream; neither path nor client headers can change the destination.
    url = httpx.URL("https://frontend-api.clerk.dev/" + path, query=request.url.query.encode())
    try:
        async with httpx.AsyncClient(timeout=30, follow_redirects=False, verify=ssl.create_default_context()) as client:
            upstream = await client.request(request.method, url, headers=headers,
                                             content=await request.body())
        response = Response(content=upstream.content, status_code=upstream.status_code,
                            headers={k: v for k, v in upstream.headers.items()
                                     if k.lower() not in HOP_HEADERS and k.lower() != "set-cookie"})
        for cookie in upstream.headers.get_list("set-cookie"):
            response.headers.append("set-cookie", cookie)
        return response
    except httpx.HTTPError:
        return Response("Identity provider unavailable", status_code=502)

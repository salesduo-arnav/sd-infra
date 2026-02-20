# Gateway / Nginx Configuration

## Overview

Nginx acts as a reverse proxy for both local development and production, routing traffic by hostname to the appropriate backend service. Local development uses `lvh.me` (resolves to 127.0.0.1), while production uses custom subdomains.

## Local Development Routing

| Hostname | Target | Description |
|----------|--------|-------------|
| `api.lvh.me` | `backend:3000` | Backend API |
| `app.lvh.me` | `frontend:8080` | Frontend SPA |
| Default | `444` (no response) | Block unknown hostnames |

## Production Routing

| Hostname | Target | Description |
|----------|--------|-------------|
| `api.salesduo.com` | Backend ECS service | Backend API |
| `app.salesduo.com` | Frontend ECS service | Frontend SPA |
| `api-test.salesduo.com` | Staging backend | Staging API |
| `app-test.salesduo.com` | Staging frontend | Staging SPA |

## Configuration Details

### DNS Resolution
```nginx
resolver 127.0.0.11 valid=10s;
```
Uses Docker's internal DNS resolver with 10-second TTL. This allows nginx to handle container restarts without reloading.

### Dynamic Upstream Resolution
```nginx
set $backend backend:3000;
proxy_pass http://$backend;
```
Using variables forces nginx to re-resolve DNS on every request, handling container IP changes from restarts.

### Proxy Headers
```nginx
proxy_set_header Host $host;
proxy_set_header X-Real-IP $remote_addr;
proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
proxy_set_header X-Forwarded-Proto $scheme;
```

### WebSocket Support
```nginx
proxy_http_version 1.1;
proxy_set_header Upgrade $http_upgrade;
proxy_set_header Connection "upgrade";
```
Configured for the frontend server (Vite HMR in development).

### Default Server
```nginx
server {
    listen 80 default_server;
    return 444;
}
```
Returns "no response" (connection closed) for unrecognized hostnames.

## Key Files

- `gateway/nginx.conf` — Nginx configuration
- `docker-compose.yml` — Gateway service definition

---

## Issues Found

1. **Default server returns 444** — Non-standard response code that closes the connection. While this blocks unknown hosts, returning 400 or 403 would be more informative for debugging.
2. **No access/error logging** — No logging configuration visible. Request logs and error logs are not written, making debugging difficult.
3. **No gzip compression** — Static assets and API responses are not compressed, increasing bandwidth usage.
4. **No security headers** — Missing security headers (Content-Security-Policy, X-Frame-Options, X-Content-Type-Options, etc.) that should be set at the proxy level.
5. **WebSocket upgrade incomplete** — WebSocket headers are set for the frontend but the configuration may not handle all edge cases.
6. **No rate limiting** — No request rate limiting configured at the nginx level.
7. **No request size limits** — No `client_max_body_size` configured. Large request bodies could cause issues.
8. **No SSL/TLS in local dev** — Local development uses plain HTTP. While `lvh.me` doesn't support HTTPS easily, some features (like secure cookies) behave differently without HTTPS.
9. **No caching headers** — Static assets served without cache headers, causing unnecessary re-fetches.

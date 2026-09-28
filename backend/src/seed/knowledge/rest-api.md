---
id: kb-rest-api
title: REST APIs
topic: rest-api
source: PrepAI Knowledge Base — REST APIs
---

# REST APIs

## REST Principles

REST (Representational State Transfer) is an architectural style for networked applications. Constraints: client-server separation, statelessness (each request carries all information needed; no server-side session state between requests), cacheability, a uniform interface, a layered system and optionally code on demand. Resources are identified by URLs and manipulated through representations, usually JSON.

## Resource Design

Use nouns for resources and HTTP methods for actions: GET /api/interviews, POST /api/interviews, GET /api/interviews/:id, PATCH /api/interviews/:id, DELETE /api/interviews/:id. Use plural collection names and nest only for clear ownership (/api/interviews/:id/answers). For actions that do not map to CRUD, a sub-resource such as POST /api/interviews/:id/complete is acceptable. Keep naming consistent (kebab-case paths, camelCase JSON fields).

## HTTP Methods and Idempotency

- GET retrieves data; safe and idempotent; must not change state.
- POST creates resources or triggers processing; not idempotent.
- PUT replaces a resource entirely; idempotent.
- PATCH partially updates; not necessarily idempotent.
- DELETE removes; idempotent (deleting twice leaves the same state, even if the second call returns 404).

Idempotency matters for retries: clients and proxies can safely retry idempotent requests. For non-idempotent operations like payments, accept an Idempotency-Key header and store the result of the first request.

## Status Codes

200 OK, 201 Created (include the new resource or its Location), 204 No Content, 400 Bad Request (malformed input), 401 Unauthorized (missing or invalid authentication), 403 Forbidden (authenticated but not allowed), 404 Not Found, 409 Conflict (e.g. email already registered), 413 Payload Too Large, 415 Unsupported Media Type, 422 Unprocessable Entity (validation failed), 429 Too Many Requests, 500 Internal Server Error, 502 Bad Gateway (upstream returned an invalid response), 503 Service Unavailable (dependency down, e.g. AI provider unreachable), 504 Gateway Timeout.

Returning 404 instead of 403 for resources owned by other users avoids revealing that they exist.

## Error Format

Return a consistent error body, for example { "error": { "code": "VALIDATION_ERROR", "message": "Email is required", "details": [...] } }. Never return stack traces, SQL errors or internal hostnames to clients in production. Log details server-side with a request ID and include that ID in the response for support.

## Pagination, Filtering and Sorting

Offset pagination (?page=2&limit=20) is simple but slows down on large offsets and can skip or repeat items when data changes. Cursor (keyset) pagination (?cursor=<last id>&limit=20) is stable and efficient. Filtering and sorting use query parameters (?status=completed&sort=-createdAt). Always cap the limit.

## Versioning

Version APIs when making breaking changes: URL versioning (/api/v1), header versioning, or media-type versioning. Prefer additive, backward-compatible changes (new optional fields).

## Authentication and Authorization

Authentication verifies identity (JWT bearer tokens, sessions, API keys, OAuth 2.0). Authorization decides what an identity may do. Every endpoint must check ownership — for example, a user may only read their own interview reports — typically by including the user ID in database queries rather than fetching by ID alone. OAuth 2.0 delegates authorization to a provider; OpenID Connect adds identity on top.

## Validation and Security

Validate request bodies, params and query strings against schemas (Joi, Zod, express-validator, Pydantic). Reject unknown fields where appropriate. Enforce size limits. Apply rate limiting on authentication and expensive endpoints (such as AI generation) to prevent abuse and control cost. Use HTTPS everywhere, configure CORS to allow only trusted origins, and set security headers. Treat file uploads as untrusted: check size, verify file signatures (magic bytes) instead of trusting the extension or MIME type, store outside the web root and delete temporary files.

## Caching

Use Cache-Control for cacheable GET responses, ETag/If-None-Match for conditional requests returning 304, and avoid caching user-specific data in shared caches.

## REST vs GraphQL vs gRPC

REST is simple, cache-friendly and universally supported, but can over-fetch or under-fetch. GraphQL lets clients request exactly the fields they need through a single endpoint and a typed schema, at the cost of more complex caching and query-cost control. gRPC uses HTTP/2 and Protocol Buffers for efficient, strongly typed service-to-service communication and streaming.

## Documentation and Testing

Document APIs with OpenAPI (Swagger). FastAPI generates OpenAPI schemas automatically from Pydantic models. Test APIs with integration tests (supertest for Express) covering success paths, validation errors, authentication failures and authorization boundaries.

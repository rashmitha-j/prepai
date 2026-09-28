---
id: kb-nodejs
title: Node.js
topic: nodejs
source: PrepAI Knowledge Base — Node.js
---

# Node.js

## What Node.js Is

Node.js is a JavaScript runtime built on the V8 engine with libuv providing an event loop, a thread pool and asynchronous I/O. It uses a single-threaded, non-blocking, event-driven model: one thread handles many concurrent connections because I/O operations do not block it. This suits I/O-bound workloads such as APIs, real-time services and proxies, and is a poor fit for heavy CPU-bound work on the main thread.

## The Node.js Event Loop

The event loop runs in phases: timers (setTimeout/setInterval callbacks), pending callbacks, idle/prepare, poll (retrieve new I/O events and run their callbacks), check (setImmediate callbacks) and close callbacks. Between phases, Node drains process.nextTick callbacks first and then promise microtasks. process.nextTick runs before promises, and overusing it can starve I/O.

Network I/O uses OS async primitives (epoll, kqueue, IOCP). File system operations, DNS lookups (dns.lookup), crypto functions such as pbkdf2 and bcrypt, and zlib run on the libuv thread pool (default size 4, set with UV_THREADPOOL_SIZE).

## Blocking the Event Loop

Synchronous operations (fs.readFileSync in a request handler, JSON.parse of huge payloads, complex regexes vulnerable to ReDoS, tight loops) block every request. Solutions: use async APIs, stream large data, offload CPU-bound work to worker_threads or separate services, and set payload size limits.

## Concurrency Options

worker_threads run JavaScript in parallel threads with message passing and optional shared memory — good for CPU-bound tasks. child_process (spawn, execFile, fork) runs separate processes; spawn/execFile with an argument array avoids shell injection, unlike exec with string interpolation. The cluster module or a process manager (PM2) runs one process per CPU core behind a shared port. Running untrusted code requires process isolation, resource limits and ideally containers — never eval or vm in the main process.

## Streams and Buffers

Streams process data piece by piece: Readable, Writable, Duplex and Transform. They keep memory usage constant for large files and network data. Backpressure stops a fast producer from overwhelming a slow consumer; pipe() and stream.pipeline() handle it and propagate errors. Buffers hold raw binary data outside the V8 heap.

## Modules and Packages

CommonJS (require) loads synchronously and caches modules after the first load. ES modules (import) are the standard and support top-level await. package.json declares dependencies; package-lock.json pins exact versions for reproducible installs. Semantic versioning: ^1.2.3 allows minor and patch updates, ~1.2.3 only patch updates. Run npm audit to find vulnerable dependencies.

## Express.js

Express is a minimal web framework built around middleware: functions (req, res, next) executed in order. Middleware handles parsing (express.json), logging, CORS, security headers (helmet), authentication, validation and rate limiting. An error-handling middleware has four arguments (err, req, res, next) and should be registered last to produce consistent, safe error responses. In Express 5, rejected promises in async handlers are forwarded to error middleware automatically.

A clean architecture separates routes (URL mapping), controllers (HTTP concerns), services (business logic) and models (data access), which keeps controllers thin and logic testable.

## Error Handling

Distinguish operational errors (invalid input, network failure, not found) from programmer errors (bugs). Handle operational errors with proper status codes and messages; never leak stack traces to clients in production. Listen for unhandledRejection and uncaughtException to log and exit gracefully, letting a process manager restart the service.

## Authentication

Passwords must be hashed with a slow, salted algorithm such as bcrypt, scrypt or Argon2 — never stored in plain text or with fast hashes like SHA-256. JWT (JSON Web Token) authentication issues a signed token containing claims such as the user ID; the server verifies the signature on each request. JWTs are stateless, so revocation needs short expiries, refresh tokens or a denylist. Reloading the user from the database on each request ensures deleted users lose access. Tokens stored in localStorage are exposed to XSS; HttpOnly cookies protect against that but require CSRF protection.

## Security Practices

Validate and sanitise all input, use helmet for security headers, configure CORS to trusted origins, rate-limit authentication endpoints, limit request body and upload sizes, prevent NoSQL injection by rejecting objects where strings are expected (e.g. {"$gt": ""} in a login email field), keep secrets in environment variables, and keep dependencies updated.

## Performance and Scaling

Use connection pooling for databases, cache frequent reads (Redis), compress responses, paginate lists, and profile with --inspect and clinic.js. Scale horizontally with stateless processes behind a load balancer. Graceful shutdown handles SIGTERM by stopping new connections, finishing in-flight requests and closing database connections.

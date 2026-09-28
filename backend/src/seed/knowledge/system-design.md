---
id: kb-system-design
title: System Design
topic: system-design
source: PrepAI Knowledge Base — System Design
---

# System Design

## Interview Framework

1. Clarify functional requirements (what the system does) and non-functional requirements (scale, latency, availability, consistency, durability).
2. Estimate scale: daily active users, requests per second, read/write ratio, storage growth. Example: 10M DAU with 10 requests each is about 100M requests/day, roughly 1,200 requests per second on average and a few times more at peak.
3. Define the API and data model.
4. Draw a high-level design: clients, load balancer, stateless services, databases, caches, queues.
5. Deep dive into bottlenecks, then discuss trade-offs, failure modes and monitoring.

## Scalability

Vertical scaling adds resources to one machine; it is simple but limited and a single point of failure. Horizontal scaling adds more machines; it requires stateless services and load balancing. Keep application servers stateless by storing sessions in a shared store or using tokens (JWT).

## Load Balancing

A load balancer distributes traffic across servers and removes unhealthy ones using health checks. Algorithms: round robin, least connections, weighted, and IP/consistent hashing for stickiness. Layer 4 balancers route by IP/port; layer 7 balancers understand HTTP and can route by path or header.

## Caching

Caches reduce latency and database load. Layers: browser cache, CDN for static assets, application cache (Redis, Memcached), database buffer cache.

Strategies: cache-aside (application reads the cache, on miss loads from the database and populates the cache — most common), write-through (write to cache and database together), write-back (write to cache, flush later; fast but risks data loss) and write-around. Eviction policies: LRU, LFU, TTL-based expiry.

Problems: stale data (invalidate on writes or use short TTLs), cache stampede (many requests miss at once; use request coalescing or locks), and hot keys.

## Databases at Scale

Replication: leader-follower copies data to read replicas for read scaling and failover; replication lag leads to eventual consistency for reads from followers. Multi-leader and leaderless replication increase write availability at the cost of conflict resolution.

Sharding splits data across nodes by a shard key (user_id, region). Hash-based sharding distributes evenly; range-based sharding supports range queries but risks hotspots. Consistent hashing minimises data movement when nodes are added or removed by placing nodes and keys on a hash ring with virtual nodes.

## Asynchronous Processing

Message queues (RabbitMQ, SQS) and logs (Kafka) decouple producers from consumers, absorb traffic spikes and enable retries. Use them for emails, notifications, video processing and AI jobs that take seconds. Delivery semantics: at-most-once, at-least-once (most common; consumers must be idempotent) and exactly-once (costly). A dead-letter queue stores messages that repeatedly fail.

## Reliability Patterns

- Timeouts on every network call.
- Retries with exponential backoff and jitter, only for idempotent operations.
- Circuit breakers stop calling a failing dependency and fail fast until it recovers.
- Rate limiting protects services (token bucket, leaky bucket, fixed or sliding window counters).
- Graceful degradation: serve partial results (e.g. keyword-based analysis) when a dependency such as an LLM is down.
- Idempotency keys make retried POST requests safe.

## Consistency Models

Strong consistency: every read sees the latest write. Eventual consistency: replicas converge over time. Read-your-writes and monotonic reads are useful middle grounds. The CAP theorem forces a choice between consistency and availability during network partitions.

## Microservices vs Monolith

A monolith is simpler to develop, test and deploy early on. Microservices allow independent deployment and scaling, and different technology stacks per service, but add network latency, distributed failures, data consistency challenges and operational overhead. Split along clear domain boundaries. Separating a Python AI service from a Node.js API is a pragmatic split: each uses the best ecosystem for its job and scales independently.

## Observability

Logs (structured events), metrics (counters, latency percentiles such as p95/p99, error rates) and traces (following a request across services with a correlation ID). Alert on symptoms users feel.

## Classic Designs

URL shortener: generate short codes with base62 encoding of a counter or random IDs with collision checks, store the mapping in a key-value store, cache hot links, and redirect with 301 or 302.

Rate limiter: token bucket per user or IP stored in Redis with atomic operations; return 429 with Retry-After.

News feed: fan-out on write (push posts to followers' feeds; fast reads, expensive for celebrities) versus fan-out on read (compute at read time); hybrids handle celebrity accounts separately.

Chat system: WebSocket gateways, a message service persisting to a partitioned store keyed by conversation, presence service, and push notifications for offline users.

RAG-based AI assistant: an ingestion pipeline chunks and embeds documents into a vector database; at query time the system embeds the question, retrieves top-k chunks, builds a grounded prompt and calls the LLM; responses are validated, and caching plus timeouts control cost and latency.

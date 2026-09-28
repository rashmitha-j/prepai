---
id: kb-dbms
title: Database Management Systems
topic: dbms
source: PrepAI Knowledge Base — DBMS
---

# Database Management Systems

## What a DBMS Provides

A database management system stores data persistently and provides concurrent access, a query language, integrity constraints, security, backup and crash recovery. Relational databases (PostgreSQL, MySQL) organise data into tables with rows and columns linked by keys. NoSQL databases (MongoDB, Redis, Cassandra) trade some relational guarantees for flexible schemas or horizontal scalability.

## Keys and Relationships

A super key is any set of columns that uniquely identifies a row. A candidate key is a minimal super key. The primary key is the chosen candidate key; it must be unique and not null. A foreign key references the primary key of another table and enforces referential integrity. A composite key uses multiple columns.

Relationships are one-to-one, one-to-many (a user has many orders; the foreign key lives on the "many" side) and many-to-many (students and courses; implemented with a junction table holding two foreign keys).

## ER Modelling

Entity-relationship diagrams describe entities, attributes and relationships before implementing tables. Weak entities depend on another entity for identification. Cardinality and participation constraints describe how many entities take part in a relationship.

## Normalization

Normalization organises tables to reduce redundancy and update anomalies (insertion, update and deletion anomalies).

- 1NF: every column holds atomic values and there are no repeating groups.
- 2NF: 1NF and no partial dependency — every non-key attribute depends on the whole primary key, not part of a composite key.
- 3NF: 2NF and no transitive dependency — non-key attributes depend only on the key, not on other non-key attributes.
- BCNF: for every functional dependency X -> Y, X is a super key. BCNF is stricter than 3NF.

Denormalization intentionally adds redundancy to speed up reads, for example storing a precomputed count or duplicating a user's name on posts. It is common in read-heavy systems and in document databases, at the cost of keeping copies consistent.

## Transactions and ACID

A transaction is a unit of work that either fully happens or not at all.

- Atomicity: all operations commit or all roll back. Implemented with undo logs.
- Consistency: a transaction moves the database from one valid state to another, respecting constraints.
- Isolation: concurrent transactions do not see each other's intermediate state.
- Durability: committed data survives crashes. Implemented with write-ahead logging (WAL): changes are written to a durable log before data pages.

## Isolation Levels and Anomalies

Concurrency anomalies: dirty read (reading uncommitted data), non-repeatable read (a row changes between two reads in the same transaction), phantom read (a repeated range query returns new rows) and lost update.

SQL isolation levels from weakest to strongest: Read Uncommitted, Read Committed (prevents dirty reads; PostgreSQL default), Repeatable Read (prevents non-repeatable reads; MySQL InnoDB default) and Serializable (behaves as if transactions ran one after another). Stronger isolation reduces anomalies but increases contention.

## Concurrency Control

Pessimistic concurrency uses locks. Shared (read) locks can be held by many transactions; exclusive (write) locks by one. Two-phase locking (2PL) — a growing phase acquiring locks and a shrinking phase releasing them — guarantees serializability but can deadlock. Databases detect deadlocks with a wait-for graph and abort one transaction.

Optimistic concurrency assumes conflicts are rare: read a version number, and at write time check that it has not changed (compare-and-set); otherwise retry. MVCC (multi-version concurrency control), used by PostgreSQL and InnoDB, keeps multiple row versions so readers never block writers.

## Indexing

An index is an auxiliary data structure that speeds up lookups at the cost of extra storage and slower writes. Most relational databases use B+ trees: balanced, high fan-out trees where all values sit in leaf nodes linked for fast range scans. Lookups cost O(log n) page reads.

A clustered index determines the physical order of rows (one per table, usually the primary key in InnoDB). A non-clustered (secondary) index stores key values with pointers to rows. A composite index on (a, b) supports queries filtering on a, or a and b, but generally not b alone — the leftmost-prefix rule. A covering index contains every column a query needs, avoiding table lookups. Hash indexes support equality but not range queries.

Do not index everything: indexes slow INSERT/UPDATE/DELETE, and low-selectivity columns (e.g. a boolean) rarely benefit. Use EXPLAIN to verify that queries use the intended index.

## CAP Theorem and Distributed Databases

In a distributed system with a network partition, a database must choose between consistency (every read sees the latest write) and availability (every request gets a response). CP systems refuse some requests during partitions; AP systems stay available and reconcile later (eventual consistency). PACELC extends this: even without partitions there is a latency versus consistency trade-off.

Scaling techniques: replication (leader-follower for read scaling and failover), sharding/partitioning (splitting data by a shard key across nodes) and caching. A poor shard key causes hotspots.

## SQL vs NoSQL

Choose relational databases for structured data with relationships, complex joins and strong transactional guarantees (payments, inventory). Choose document stores for flexible, nested, evolving data accessed as a whole (user profiles, content), key-value stores for caching and sessions, wide-column stores for massive write throughput, and graph databases for relationship-heavy queries.

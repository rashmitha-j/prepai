---
id: kb-sql
title: SQL
topic: sql
source: PrepAI Knowledge Base — SQL
---

# SQL

## Query Execution Order

A SELECT statement is written as SELECT ... FROM ... WHERE ... GROUP BY ... HAVING ... ORDER BY ... LIMIT, but it is logically evaluated in this order: FROM (and JOINs), WHERE, GROUP BY, HAVING, SELECT, DISTINCT, ORDER BY, LIMIT/OFFSET. This explains why a column alias defined in SELECT cannot be used in WHERE, and why aggregate conditions go in HAVING.

## Filtering and Aggregation

WHERE filters rows before grouping; HAVING filters groups after aggregation. Aggregate functions: COUNT, SUM, AVG, MIN, MAX. COUNT(*) counts rows, COUNT(column) ignores NULLs, COUNT(DISTINCT column) counts unique non-null values.

NULL represents an unknown value. Comparisons with NULL yield UNKNOWN, so use IS NULL / IS NOT NULL instead of = NULL. COALESCE(a, b) returns the first non-null argument. NOT IN with a subquery that returns a NULL yields no rows — prefer NOT EXISTS.

## Joins

- INNER JOIN returns rows with matches in both tables.
- LEFT JOIN returns all rows from the left table and matched rows from the right, with NULLs where there is no match. "Find customers with no orders": LEFT JOIN orders and filter WHERE orders.id IS NULL.
- RIGHT JOIN is the mirror of LEFT JOIN.
- FULL OUTER JOIN returns rows from both sides, matched where possible.
- CROSS JOIN returns the Cartesian product.
- A self join joins a table to itself, e.g. employees with their managers: FROM employees e JOIN employees m ON e.manager_id = m.id.

A condition in the ON clause of a LEFT JOIN restricts which right rows match; the same condition in WHERE removes left rows, effectively turning it into an inner join.

## Subqueries and CTEs

A subquery is a query nested inside another. A correlated subquery references the outer query and runs once per outer row. EXISTS stops at the first match and is often efficient for existence checks.

Common table expressions (WITH name AS (...)) make complex queries readable. A recursive CTE (WITH RECURSIVE) traverses hierarchies such as organisation charts or category trees.

## Window Functions

Window functions compute values across a set of rows related to the current row without collapsing them like GROUP BY does. Syntax: function() OVER (PARTITION BY col ORDER BY col).

- ROW_NUMBER() assigns unique sequential numbers.
- RANK() leaves gaps after ties (1, 1, 3); DENSE_RANK() does not (1, 1, 2).
- LAG()/LEAD() read the previous or next row, useful for day-over-day change.
- SUM() OVER (ORDER BY date) computes a running total.

Classic interview question — Nth highest salary: SELECT DISTINCT salary FROM (SELECT salary, DENSE_RANK() OVER (ORDER BY salary DESC) AS r FROM employees) t WHERE r = N. Top earner per department: use ROW_NUMBER() OVER (PARTITION BY department_id ORDER BY salary DESC) and keep row number 1.

## Set Operations

UNION combines results and removes duplicates; UNION ALL keeps duplicates and is faster. INTERSECT returns common rows, EXCEPT (MINUS in Oracle) returns rows in the first query but not the second. Column counts and types must be compatible.

## DDL, DML and Constraints

DDL defines structure: CREATE, ALTER, DROP, TRUNCATE. DML changes data: INSERT, UPDATE, DELETE. DCL manages permissions: GRANT, REVOKE. TCL controls transactions: COMMIT, ROLLBACK, SAVEPOINT.

DELETE removes rows one by one, can use WHERE, fires triggers and can be rolled back. TRUNCATE removes all rows quickly by deallocating pages and resets identity counters. DROP removes the table definition itself.

Constraints: PRIMARY KEY, FOREIGN KEY (with ON DELETE CASCADE / SET NULL / RESTRICT), UNIQUE, NOT NULL, CHECK and DEFAULT.

## Views, Stored Procedures and Triggers

A view is a saved query that behaves like a virtual table; it simplifies access and can restrict columns for security. A materialized view stores the result physically and must be refreshed. Stored procedures encapsulate logic in the database. Triggers run automatically on INSERT, UPDATE or DELETE, for example to maintain audit logs.

## Performance

Index columns used in WHERE, JOIN and ORDER BY clauses. Avoid SELECT * in production queries. Functions applied to an indexed column (WHERE YEAR(created_at) = 2024) usually prevent index use; rewrite as a range. A leading wildcard (LIKE '%abc') cannot use a B-tree index. Use EXPLAIN / EXPLAIN ANALYZE to inspect plans, and paginate large results with keyset pagination (WHERE id > last_id ORDER BY id LIMIT 20) instead of large OFFSETs.

## SQL Injection

SQL injection happens when user input is concatenated into SQL, letting attackers change the query. Prevent it with parameterized queries or prepared statements, least-privilege database accounts and input validation. ORMs parameterize by default but raw queries still need care.

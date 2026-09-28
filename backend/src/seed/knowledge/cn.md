---
id: kb-cn
title: Computer Networks
topic: cn
source: PrepAI Knowledge Base — Computer Networks
---

# Computer Networks

## Layered Models

The OSI model has seven layers: physical, data link, network, transport, session, presentation and application. The TCP/IP model used in practice has four: link, internet (IP), transport (TCP/UDP) and application (HTTP, DNS, SMTP). Each layer adds its own header (encapsulation) and relies only on the service of the layer below.

## IP Addressing and Routing

IPv4 addresses are 32 bits; IPv6 addresses are 128 bits. CIDR notation (192.168.1.0/24) specifies the network prefix length; a /24 has 256 addresses. Private ranges (10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16) are not routable on the internet; NAT translates private addresses to a public one. Routers forward packets based on the longest prefix match in their routing tables. ARP maps IP addresses to MAC addresses on a local network. DHCP assigns IP configuration automatically.

## TCP

TCP provides reliable, ordered, byte-stream delivery with flow control and congestion control.

Three-way handshake: the client sends SYN, the server replies SYN-ACK, the client sends ACK. Both sides exchange initial sequence numbers. Connection termination uses FIN and ACK in both directions (four steps); the side that closes first enters TIME_WAIT to handle delayed packets.

Reliability comes from sequence numbers, acknowledgements, retransmission timers and checksums. Flow control uses the receiver's advertised window so a fast sender does not overwhelm a slow receiver. Congestion control (slow start, congestion avoidance, fast retransmit, fast recovery) adapts the sending rate to network conditions. Head-of-line blocking occurs because a lost segment blocks delivery of later bytes.

## UDP

UDP is connectionless and unreliable: no handshake, no ordering, no retransmission, minimal header. It has lower latency and suits DNS queries, video calls, online games and streaming, where late data is useless. Reliability, if needed, is implemented at the application layer (as QUIC does).

## DNS

DNS resolves domain names to IP addresses. The client asks a recursive resolver, which queries root servers, then top-level-domain servers (.com), then the authoritative name server for the domain. Results are cached according to TTL at many levels. Record types: A (IPv4), AAAA (IPv6), CNAME (alias), MX (mail), NS (name server) and TXT (verification and SPF).

## HTTP

HTTP is a stateless request-response protocol. Methods: GET (read, safe and idempotent), POST (create, not idempotent), PUT (replace, idempotent), PATCH (partial update), DELETE (idempotent). Status classes: 1xx informational, 2xx success (200 OK, 201 Created, 204 No Content), 3xx redirection (301 permanent, 302/307 temporary, 304 Not Modified), 4xx client errors (400, 401 Unauthorized, 403 Forbidden, 404, 409 Conflict, 422, 429 Too Many Requests) and 5xx server errors (500, 502 Bad Gateway, 503 Service Unavailable, 504 Gateway Timeout).

HTTP/1.1 introduced persistent connections but suffers head-of-line blocking per connection. HTTP/2 multiplexes many streams over one TCP connection with binary framing and header compression. HTTP/3 runs over QUIC (UDP) to avoid TCP head-of-line blocking and speed up connection setup.

Cookies carry state across stateless requests. Important attributes: HttpOnly (not readable by JavaScript), Secure (HTTPS only), SameSite (limits cross-site sending, mitigating CSRF) and Expires/Max-Age. Caching headers: Cache-Control, ETag and Last-Modified enable conditional requests.

## HTTPS and TLS

HTTPS is HTTP over TLS. TLS provides confidentiality (encryption), integrity (MACs) and authentication (certificates). During the handshake the client verifies the server's certificate chain up to a trusted certificate authority, then both sides derive symmetric session keys using ephemeral Diffie-Hellman key exchange, which provides forward secrecy. Asymmetric cryptography is used for authentication and key exchange; symmetric encryption (AES-GCM, ChaCha20) protects bulk data because it is much faster.

## What Happens When You Type a URL

The browser parses the URL, checks caches, resolves the domain through DNS, opens a TCP connection (three-way handshake) and performs a TLS handshake for HTTPS, then sends an HTTP request. The request may pass through a CDN, load balancer and reverse proxy to an application server that queries databases and caches. The browser receives the response, parses HTML, builds the DOM and CSSOM, fetches sub-resources, runs JavaScript, and lays out and paints the page.

## Sockets and Real-Time Communication

A socket is an endpoint identified by IP address and port; a TCP connection is identified by the 4-tuple of source and destination IP and port. Polling repeatedly asks the server for updates. Long polling holds a request open until data is available. Server-Sent Events provide a one-way stream from server to client over HTTP. WebSockets upgrade an HTTP connection into a persistent, full-duplex channel for chat, collaboration and live dashboards.

## Network Security Basics

Common attacks: man-in-the-middle (mitigated by TLS and certificate validation), DDoS (mitigated by rate limiting, CDNs and scrubbing), DNS spoofing (DNSSEC), and session hijacking (secure, HttpOnly cookies). Firewalls filter traffic by rules; a reverse proxy can terminate TLS and hide internal services.

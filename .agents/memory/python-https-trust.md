---
name: Python HTTPS trust
description: Replit environment certificate verification for Python external services
---

Python HTTPS clients should use the system trust store, with certificate validation
enabled, rather than assuming a bundled certificate file has the environment's roots.

**Why:** During real authenticated-browser verification, signature validation worked
but the provider profile lookup failed with an issuer-certificate error. The same
public endpoint succeeded using the system SSL context. This was not a provider
credential or expired-session problem.

**How to apply:** When integrating another Python HTTPS client here, retain TLS
verification and select the system SSL context. Treat provider/network outages as
temporary failures, not as proof that a user's valid session has expired. Never
disable verification to make requests work.

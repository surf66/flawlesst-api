# Health Lambda

## Overview

This Lambda exposes a simple health/status endpoint used for monitoring and uptime checks.

## Trigger

- **Source:** API Gateway / HTTP endpoint
- **Event type:** HTTP request event

## Input

- Typically no body; may include headers or query params used for diagnostics.

## Environment Variables

- None required by default, unless health checks depend on external services.

## Behavior

- Responds with a lightweight payload indicating service health.
- May optionally check connectivity to critical dependencies (DBs, queues, etc.).

## Outputs

- **Success:** 2xx response with health status JSON.
- **Failure:** 5xx response if internal checks fail.

## Notes

- Clearly document any additional diagnostics added to the response.

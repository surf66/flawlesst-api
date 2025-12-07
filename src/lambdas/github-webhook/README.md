# GitHub Webhook Lambda

## Overview

This Lambda processes incoming GitHub webhooks (e.g. `push`, `pull_request`, `installation`, etc.) and triggers the appropriate internal workflows.

## Trigger

- **Source:** GitHub Webhook → API Gateway / Lambda integration
- **Event type:** GitHub webhook event payload

## Input Event

- Raw GitHub webhook JSON body.
- Signature headers (e.g. `X-Hub-Signature-256`).
- Event type header (e.g. `X-GitHub-Event`).

## Environment Variables

- `GITHUB_WEBHOOK_SECRET` – Shared secret for verifying signatures.
- Any routing / feature flags that alter behavior by event type.

## Behavior

- Validates GitHub webhook signature.
- Switches on event type (e.g. `push`, `pull_request`, etc.).
- Enqueues or invokes downstream lambdas/workflows as needed.

## Outputs

- **Success:** 2xx HTTP response to GitHub.
- **Failure:** 4xx/5xx HTTP response with logged error details.

## Notes

- Keep supported event types in sync with the code.
- If API Gateway is used, document mapping templates or additional headers here.

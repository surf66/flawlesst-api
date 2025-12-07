# Clone Repo Lambda

## Overview

This Lambda is responsible for cloning a specified Git repository into the system’s workspace.

## Trigger

- **Source:** AWS Lambda (invoked by another service or workflow)
- **Event type:** Custom event payload

## Input Event Shape (Example)

```json
{
  "repoUrl": "https://github.com/org/repo.git",
  "branch": "main",
  "installationId": 123456,
  "requestId": "uuid-or-trace-id"
}
```

## Environment Variables

- `GITHUB_APP_ID` – GitHub App identifier (if applicable).
- `GITHUB_PRIVATE_KEY` – Private key used to authenticate as GitHub App.
- Any other repo/workspace configuration variables used by the code.

## Behavior

- Clones the repository at the requested branch.
- Prepares any required local structure for subsequent processing lambdas.
- Emits logs suitable for tracing by `requestId`.

## Outputs

- **Success:** Returns metadata about the cloned repository (e.g. local path, commit SHA).
- **Failure:** Throws/logs an error describing why the clone failed.

## Notes

- Update this README whenever the event contract or environment variables change.

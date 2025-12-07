# Start Clone Execution Lambda

## Overview

This Lambda starts a clone execution workflow (e.g. Step Functions or equivalent) for a specific repository and branch.

## Trigger

- **Source:** API, GitHub webhook handler, or internal service
- **Event type:** Custom event payload

## Input Event Shape (Example)

```json
{
  "repo": {
    "owner": "org",
    "name": "repo-name"
  },
  "branch": "main",
  "installationId": 123456,
  "requestId": "uuid-or-trace-id"
}
```

## Environment Variables

- `CLONE_STATE_MACHINE_ARN` (if using Step Functions).
- Any configuration required to start downstream workflows.

## Behavior

- Validates incoming request.
- Starts the clone/explode or broader analysis workflow.
- Returns identifiers for tracking the execution.

## Outputs

- **Success:** Execution ID / tracking information.
- **Failure:** Error description if execution cannot be started.

## Notes

- Keep this README aligned with the workflow contract (inputs/outputs) as it evolves.

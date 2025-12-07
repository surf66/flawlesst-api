# Connect Project Lambda

## Overview

This Lambda handles connecting a GitHub project/repository to the Flawlesst API backend (e.g. storing linkage, configuration, or callbacks).

## Trigger

- **Source:** AWS Lambda (invoked via API or GitHub app flow)
- **Event type:** Custom event payload

## Input Event Shape (Example)

```json
{
  "installationId": 123456,
  "repository": {
    "id": 111,
    "name": "repo-name",
    "fullName": "org/repo-name"
  },
  "requestId": "uuid-or-trace-id"
}
```

## Environment Variables

- Database / persistence configuration (e.g. `DB_TABLE_NAME`).
- Any GitHub app configuration required for connection.

## Behavior

- Validates the incoming project/installation information.
- Persists or updates the project connection in the backend.
- May return identifiers used by other lambdas.

## Outputs

- **Success:** Confirmation and IDs for the connected project.
- **Failure:** Error details for invalid configuration or persistence issues.

## Notes

- Keep the structure of the event documented here in sync with the actual handler.

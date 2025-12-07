# Explode Repo Lambda

## Overview

This Lambda processes a cloned repository ("explodes" it) into a more granular representation (e.g. files, metadata, analysis units) for later stages of the system.

## Trigger

- **Source:** AWS Lambda (step in a larger workflow after clone)
- **Event type:** Custom event payload

## Input Event Shape (Example)

```json
{
  "repoLocalPath": "s3-or-local-path-to-clone",
  "repo": {
    "owner": "org",
    "name": "repo-name"
  },
  "requestId": "uuid-or-trace-id"
}
```

## Environment Variables

- `EXPLODE_BUCKET` or similar (if storing exploded artifacts).
- Any analysis / processing configuration variables.

## Behavior

- Reads the cloned repo from the provided location.
- Breaks the repository into the units required by downstream services.
- Writes outputs (e.g. to S3, database, or another service).

## Outputs

- **Success:** Locations/IDs of the exploded artifacts.
- **Failure:** Error details if repo cannot be processed.

## Notes

- Document any new analysis stages or output formats added here.

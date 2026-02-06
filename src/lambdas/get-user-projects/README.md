# Get User Projects

This Lambda function retrieves all connected repositories (projects) for a specific user from the `connected_repositories` table.

## Endpoint

```
GET /get-user-projects?userId={user_id}
```

## Parameters

- `userId` (query parameter, required): The UUID of the user whose projects you want to retrieve

## Response

### Success Response (200)

```json
{
  "projects": [
    {
      "id": "uuid",
      "user_id": "uuid", 
      "github_repo_id": 123456789,
      "owner": "repository-owner",
      "repo_name": "repository-name",
      "branch": "main",
      "created_at": "2024-01-01T00:00:00.000Z",
      "updated_at": "2024-01-01T00:00:00.000Z"
    }
  ],
  "total_projects": 1
}
```

### Error Responses

**400 Bad Request** - Missing userId parameter:
```json
{
  "error": "Missing required parameter: userId",
  "message": "userId must be provided as a query parameter"
}
```

**500 Internal Server Error** - Database error:
```json
{
  "error": "Database query failed",
  "message": "Specific error message from database"
}
```

## Environment Variables

- `SUPABASE_URL`: Supabase project URL
- `SUPABASE_SERVICE_KEY`: Supabase service role key for database access

## Example Usage

```bash
curl -H "x-api-key: YOUR_API_KEY" \
  "https://your-api-domain.com/prod/get-user-projects?userId=123e4567-e89b-12d3-a456-426614174000"
```

## Database Schema

The function queries the `connected_repositories` table with the following schema:

```sql
CREATE TABLE connected_repositories (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL,
    github_repo_id BIGINT NOT NULL,
    owner TEXT NOT NULL,
    repo_name TEXT NOT NULL,
    branch TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

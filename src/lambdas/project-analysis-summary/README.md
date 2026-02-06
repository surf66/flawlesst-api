# Project Analysis Summary Lambda

This Lambda function provides project analysis summary data for users, returning analysis results from the project_analysis_summary database view.

## Purpose

- Retrieve project analysis summaries for a specific user
- Support filtering by specific project ID
- Return the latest analysis report per project
- Provide comprehensive project metrics including scores, test coverage, and file analysis data

## API Endpoint

```
GET /project-analysis-summary/{projectId}
```

## Parameters

- `projectId` (path, required): Specific project ID to retrieve summary for
- `userId` (query, required): User ID to verify ownership of the project

## Example Usage

### Get summary for a specific project:
```
GET /project-analysis-summary/87654321-4321-4321-4321-210987654321?userId=12345678-1234-1234-1234-123456789012
```

## Response Structure

### Single Project Response:
```json
{
  "project_summary": {
    "project_id": "uuid",
    "project_name": "string",
    "report_id": "uuid",
    "overall_score": 85,
    "total_files": 150,
    "files_with_tests": 75,
    "test_coverage_percentage": 50.0,
    "average_score": 8.5,
    "analysis_date": "2024-01-15T10:30:00Z",
    "analyzed_files_count": 150,
    "avg_file_score": 8.5
  },
  "total_reports": 1
}
```

## Data Fields

- `project_id`: Unique identifier for the project
- `project_name`: Human-readable project name
- `report_id`: Unique identifier for the analysis report
- `overall_score`: Overall project score (0-100)
- `total_files`: Total number of files analyzed
- `files_with_tests`: Number of files that have tests
- `test_coverage_percentage`: Percentage of files with test coverage
- `average_score`: Average score across all files (0-10)
- `analysis_date`: When the analysis was performed
- `analyzed_files_count`: Count of files that were analyzed
- `avg_file_score`: Average score per file

## Environment Variables

- `SUPABASE_URL`: Supabase project URL
- `SUPABASE_SERVICE_KEY`: Supabase service role key for database access

## Error Responses

### 400 Bad Request
```json
{
  "error": "Missing required parameter: userId",
  "message": "userId must be provided as a query parameter or path parameter"
}
```

### 404 Not Found
```json
{
  "error": "No project summaries found",
  "message": "No analysis reports found for user [userId]"
}
```

### 500 Internal Server Error
```json
{
  "error": "Database query failed",
  "message": "[Detailed error message]"
}
```

## Database Schema

The function queries the `project_analysis_summary` view which includes data from:
- `projects` table (project metadata)
- `project_reports` table (analysis results)
- `file_analysis` table (individual file analysis)

## Security

- Requires API key authentication (configured in API Gateway)
- Uses Row Level Security (RLS) policies in Supabase to ensure users can only access their own projects
- Service role key used for Lambda to bypass RLS when needed

## Dependencies

- @supabase/supabase-js
- aws-lambda
- aws-cdk-lib

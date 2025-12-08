# Aggregate Results Lambda

This Lambda function processes all the micro-reports from the Map phase and creates a comprehensive master report as part of the Reduce phase in the Map-Reduce architecture.

## Purpose

- Reads all individual file analysis results from S3
- Calculates aggregate metrics (average scores, test coverage)
- Uses AI to summarize observations into executive bullet points
- Saves final report to Supabase database
- Creates backup copy in S3

## Input Structure

```typescript
{
  userId: string;        // User ID
  projectId: string;     // Project ID
  jobExecutionId: string; // Step Function execution ID
  filePaths: string[];   // List of processed file paths
}
```

## Output Structure

```typescript
{
  id: string;
  project_id: string;
  overall_score: number; // 0-100 (average of all files)
  summary: string; // AI-generated executive summary
  total_files: number;
  files_with_tests: number;
  average_score: number; // 0-10 with 1 decimal
  created_at: string;
}
```

## Database Schema

### project_reports table

- `id`: UUID (Primary Key)
- `project_id`: UUID (Foreign Key to Projects)
- `overall_score`: Integer (0-100)
- `summary`: Text (AI generated executive summary)
- `total_files`: Integer
- `files_with_tests`: Integer
- `average_score`: Numeric (0-10, 1 decimal)
- `created_at`: Timestamp

### file_analysis table

- `report_id`: UUID (Foreign Key to project_reports)
- `file_path`: Text
- `score`: Integer (0-10)
- `has_tests`: Boolean
- `test_type`: Text
- `suggestions`: JSONB array

## Processing Logic

1. **Fetch Results**: Lists and reads all JSON files from the analysis results folder
2. **Calculate Metrics**:
   - Overall score = average of all file scores (scaled to 0-100)
   - Test coverage percentage
   - Files with/without tests
3. **AI Summarization**: Sends all observations to AI for executive summary
4. **Database Storage**: Inserts master report and file-level details
5. **Backup**: Saves complete report to S3 for archival

## Environment Variables

- `RESULTS_BUCKET`: S3 bucket containing analysis results
- `SUPABASE_URL`: Supabase project URL
- `SUPABASE_SERVICE_KEY`: Supabase service role key

## Error Handling

- Creates failure reports if aggregation fails
- Batch inserts file records to avoid payload limits
- Comprehensive logging for debugging
- Graceful degradation for partial failures

## Dependencies

- @aws-sdk/client-s3
- @aws-sdk/client-bedrock-runtime
- @supabase/supabase-js

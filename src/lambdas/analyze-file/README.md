# Analyze File Lambda

This Lambda function analyzes individual code files for testability and automation maturity as part of the Map phase in the Map-Reduce architecture.

## Purpose

- Reads a single file from S3
- Sends the file content to AI (Claude via Bedrock) for analysis
- Forces structured JSON output for aggregation
- Saves the micro-report to S3 results folder

## Input Structure

```typescript
{
  fileKey: string; // S3 key of the file to analyze
  fileName: string; // Name of the file
  userId: string; // User ID
  projectId: string; // Project ID
  jobExecutionId: string; // Step Function execution ID
}
```

## Output Structure

```typescript
{
  file_name: string;
  automation_score: number;     // 0-10
  has_tests: boolean;
  test_type: 'unit' | 'integration' | 'e2e' | 'none';
  observations: string[];
  improvement_suggestions: string[];
}
```

## Environment Variables

- `SOURCE_BUCKET`: S3 bucket containing source files
- `RESULTS_BUCKET`: S3 bucket for analysis results (defaults to SOURCE_BUCKET)
- `AWS_REGION`: AWS region

## AI Analysis Criteria

The AI evaluates files based on:

- **Score 10**: Perfect coverage, mockable interfaces, CI-ready
- **Score 5**: Some logic but hard to test (tight coupling), no tests present
- **Score 0**: Untestable spaghetti code, hardcoded secrets/paths

## Error Handling

- Failed analyses return a default result with score 0
- All results (including failures) are saved to S3 for tracking
- Content is truncated at 50k characters to avoid token limits

## Dependencies

- @aws-sdk/client-s3
- @aws-sdk/client-bedrock-runtime

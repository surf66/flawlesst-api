# AI Analysis Architecture: Map-Reduce Pattern

This document describes the Map-Reduce architecture implemented for analyzing repository code quality and test automation maturity.

## Overview

The AI Analysis system processes repository files using a distributed Map-Reduce pattern to analyze code quality at scale and generate comprehensive reports.

## Architecture Flow

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Clone Repo    │ -> │   Explode Repo  │ -> │  Map Phase      │
│   Lambda        │    │   Lambda        │    │  (Distributed)  │
└─────────────────┘    └─────────────────┘    └─────────────────┘
                                                        │
                                                        v
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Aggregator    │ <- │  Reduce Phase   │ <- │  Results S3     │
│   Lambda        │    │  (Final)        │    │  Storage        │
└─────────────────┘    └─────────────────┘    └─────────────────┘
        │
        v
┌─────────────────┐
│   Supabase DB   │
│   Reports       │
└─────────────────┘
```

## Components

### 1. Map Phase (Distributed Analysis)

**Location**: `src/lambdas/analyze-file/`

**Purpose**: Analyze individual files in parallel

**Features**:

- Processes one file per Lambda invocation
- Uses Claude AI via AWS Bedrock for analysis
- Enforces structured JSON output
- Handles content truncation for large files
- Saves micro-reports to S3

**Concurrency**: Up to 50 parallel Lambdas

**Input**:

```typescript
{
  fileKey: string,
  fileName: string,
  userId: string,
  projectId: string,
  jobExecutionId: string
}
```

**Output**:

```typescript
{
  file_name: string,
  automation_score: number,     // 0-10
  has_tests: boolean,
  test_type: 'unit' | 'integration' | 'e2e' | 'none',
  observations: string[],
  improvement_suggestions: string[]
}
```

### 2. Reduce Phase (Aggregation)

**Location**: `src/lambdas/aggregate-results/`

**Purpose**: Combine all micro-reports into a master report

**Features**:

- Reads all analysis results from S3
- Calculates aggregate metrics
- Uses AI to summarize observations
- Stores results in Supabase database
- Creates backup in S3

**Processing Logic**:

1. Fetch all micro-reports from S3
2. Calculate average scores and metrics
3. Send observations to AI for executive summary
4. Insert master report and file details into database
5. Save complete report to S3 for archival

### 3. Step Function Integration

**Location**: `lib/flawlesst-api-stack.ts`

**Workflow**:

```
Clone Repo -> Explode Repo -> Map State -> Result Writer -> Aggregator
```

**Key Features**:

- Map state with 50 parallel executions
- Automatic result collection
- Error handling and retries
- 30-minute total timeout

## Data Flow

### File Processing Pipeline

1. **Repository Cloning**: GitHub repo cloned and uploaded to S3 as .tar.gz
2. **File Explosion**: Repo extracted, filtered, and individual files stored in S3
3. **Distributed Analysis**: Each file analyzed by separate Lambda
4. **Result Collection**: All micro-reports collected in S3 folder
5. **Aggregation**: Final report generated and stored in database

### S3 Storage Structure

```
s3://bucket/
├── {userId}/{projectId}/
│   ├── source-files/           # Individual source files
│   ├── analysis-results/{jobId}/
│   │   ├── file1.json         # Individual file analyses
│   │   ├── file2.json
│   │   └── ...
│   └── final-reports/{jobId}/
│       └── master-report.json # Complete aggregated report
```

### Database Schema

**project_reports**:

- Master report with overall score and summary
- Executive-level metrics

**file_analysis**:

- Individual file analysis details
- Supports drill-down views

## AI Integration

### Model Configuration

- **Provider**: Anthropic Claude 3 Haiku
- **Service**: AWS Bedrock
- **Region**: Configurable (default: us-east-1)

### Prompt Engineering

- **System Prompt**: Defines role as Senior SDET
- **User Prompt**: Structured analysis request with scoring criteria
- **Forced JSON**: Ensures parseable output for aggregation

### Scoring Criteria

- **10/10**: Perfect coverage, mockable interfaces, CI-ready
- **5/10**: Some logic but hard to test, no tests present
- **0/10**: Untestable spaghetti code, hardcoded secrets

## Performance & Scaling

### Concurrency Limits

- **Map State**: 50 parallel Lambdas
- **Individual Lambda**: 2-minute timeout
- **Total Workflow**: 30-minute timeout

### Cost Optimization

- Content truncation at 50k characters
- Efficient batch database inserts
- S3 lifecycle policies for old results

### Error Handling

- Failed analyses saved with score 0
- Partial aggregation supported
- Comprehensive logging

## Configuration

### Required Environment Variables

**For All Lambdas**:

- `AWS_REGION`: AWS region

**For Analyze File Lambda**:

- `SOURCE_BUCKET`: Source files bucket
- `RESULTS_BUCKET`: Results bucket

**For Aggregate Results Lambda**:

- `RESULTS_BUCKET`: Results bucket
- `SUPABASE_URL`: Supabase project URL
- `SUPABASE_SERVICE_KEY`: Service role key

### AWS Permissions

Required IAM permissions:

- S3 read/write access
- Bedrock runtime invoke access
- Step Functions service access

## Monitoring & Observability

### CloudWatch Metrics

- Lambda invocation counts
- Duration and error rates
- Step Function execution status

### Logging Strategy

- Structured JSON logs
- Execution tracking with job IDs
- Error details with context

### Health Checks

- Individual Lambda health endpoints
- Step Function execution monitoring
- Database connection validation

## Security Considerations

### Data Protection

- Encrypted S3 storage
- Secure database connections
- No sensitive data in logs

### Access Control

- IAM role-based permissions
- Row-level security in database
- API key authentication

## Future Enhancements

### Potential Improvements

1. **Custom Scoring Models**: Configurable scoring criteria
2. **Language-Specific Analysis**: Specialized prompts per language
3. **Historical Tracking**: Trend analysis over time
4. **Integration Hooks**: Webhooks for report completion
5. **Enhanced UI**: Interactive analysis dashboard

### Scaling Options

1. **Dynamic Concurrency**: Auto-adjust based on repo size
2. **Regional Deployment**: Multi-region analysis
3. **Caching**: Cache repeated file analyses
4. **Streaming**: Real-time progress updates

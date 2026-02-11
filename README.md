# flawlesst-api

Flawlesst API - Project Analysis and Accessibility Scanning System

## Overview

This API provides:
- **Code Analysis**: Automated code quality analysis for GitHub repositories
- **Accessibility Scanning**: Scheduled and on-demand accessibility scans for websites
- **Project Management**: Track and analyze multiple projects over time

## Features

### Code Analysis
- Clone and analyze GitHub repositories
- AI-powered code quality assessment
- File-by-file analysis with detailed reports
- Step Functions for reliable workflow execution

### Accessibility Scanning
- **Individual Scans**: On-demand accessibility scans for specific URLs
- **Scheduled Scans**: Daily automated scans at 4am UTC for all registered URLs
- **Comprehensive Reporting**: Detailed violation reports with screenshots
- **Error Handling**: Robust error handling and retry logic

## Quick Start

### Prerequisites

- Node.js 18+
- AWS CLI configured
- AWS CDK installed
- Supabase project with service key

### Installation

```bash
# Install dependencies
npm install

# Configure environment variables
cp env.example .env
# Edit .env with your configuration

# Deploy infrastructure
npm run deploy

# Apply database migrations
./scripts/apply-accessibility-scheduler-migrations.sh
```

## API Endpoints

### Code Analysis

- `POST /clone-repo` - Start repository analysis
- `POST /analysis` - Start analysis for existing code
- `GET /project-analysis-summary/{projectId}` - Get project analysis summary
- `GET /get-user-projects` - Get user's projects

### Accessibility Scanning

#### Individual Scan
```bash
curl -X POST \
  -H "Content-Type: application/json" \
  -H "x-api-key: YOUR_API_KEY" \
  -d '{
    "target_url": "https://example.com",
    "customer_id": "user-uuid-here"
  }' \
  https://your-api-url/prod/accessibility-scan
```

#### Scheduled Scan (Manual Trigger)
```bash
curl -X POST \
  -H "Content-Type: application/json" \
  -H "x-api-key: YOUR_API_KEY" \
  -d '{
    "mode": "scheduled"
  }' \
  https://your-api-url/prod/accessibility-scan
```

## Database Schema

### Key Tables

- `user_accessibility_urls` - Stores URLs to be scanned
- `accessibility_scans` - Stores scan results and history
- `projects` - Project metadata
- `project_reports` - Analysis results
- `file_analysis` - Individual file analysis

## Architecture

### Components

- **API Gateway**: REST API endpoints
- **Lambda Functions**: Business logic handlers
- **Step Functions**: Orchestrate complex workflows
- **Fargate**: Accessibility scanning containers
- **EventBridge**: Scheduled task execution
- **Supabase**: Database and storage

### Accessibility Scanning Flow

1. **Scheduled Mode** (4am UTC daily):
   - EventBridge triggers lambda
   - Lambda fetches all URLs from `user_accessibility_urls`
   - Creates scan records and triggers Fargate tasks
   - Results saved to `accessibility_scans` table

2. **Individual Mode**:
   - API call triggers lambda directly
   - Single URL scanned and result returned

## Testing

### Run Tests

```bash
# Test accessibility scan scheduler
./scripts/test-scheduled-accessibility-scan.sh

# Test accessibility scanning locally
./scripts/test-accessibility-scan.sh
```

### Environment Setup for Testing

```bash
export API_URL="https://your-api-url.com/prod"
export API_KEY="your-api-key"
```

## Monitoring

### CloudWatch Logs

- Lambda functions: `/aws/lambda/FlawlesstApiStack-*`
- Fargate tasks: `/ecs/accessibility-scanner`
- Step Functions: Check AWS Step Functions console

### Database Monitoring

Monitor scan results and system health through the Supabase dashboard.

## Configuration

### Environment Variables

See `env.example` for required environment variables:

- `SUPABASE_URL` - Supabase project URL
- `SUPABASE_SERVICE_KEY` - Supabase service role key
- `FLAWLESST_GITHUB_WEBHOOK_URL` - GitHub webhook endpoint
- `FLAWLESST_WEBHOOK_SECRET_BASE` - Webhook secret base

### Changing Schedule

Modify the EventBridge schedule in `lib/flawlesst-api-stack.ts`:

```typescript
schedule: events.Schedule.cron({
  minute: '0',
  hour: '4',  // UTC hour
  month: '*',
  weekDay: '*',
  year: '*'
})
```

## Deployment

```bash
# Deploy all infrastructure
npm run deploy

# Deploy scanner container
./scripts/deploy-scanner.sh

# Apply database migrations
./scripts/apply-accessibility-scheduler-migrations.sh
```

## Documentation

- [Accessibility Scanner Setup](docs/ACCESSIBILITY_SCANNER_SETUP.md)
- [Accessibility Scan Scheduler Setup](docs/ACCESSIBILITY_SCAN_SCHEDULER_SETUP.md)
- [AI Analysis Architecture](docs/AI_ANALYSIS_ARCHITECTURE.md)
- [OpenAPI Specification](docs/openapi.yaml)

## Security

- API keys required for all endpoints
- Row Level Security (RLS) enabled on all tables
- Service role keys used for backend operations
- VPC isolation for Fargate tasks

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## License

[Add your license here]
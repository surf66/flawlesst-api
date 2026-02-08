# Accessibility Scanner Setup Guide

This guide walks through setting up the AI-powered accessibility testing SaaS using AWS Fargate, Playwright, and axe-core.

## Overview

The accessibility scanning system consists of:

1. **Scanner Container** - Playwright + axe-core running in Docker on AWS Fargate
2. **Lambda Trigger** - API endpoint that starts Fargate tasks
3. **Database** - Supabase for storing scan results
4. **Infrastructure** - AWS CDK for provisioning resources

## Architecture

```
API Gateway → Lambda → ECS Fargate Task → Playwright + axe-core
                     ↓
                  Supabase (Results)
```

## Prerequisites

- AWS CLI configured with appropriate permissions
- Node.js 18+ installed
- Docker installed and running
- Supabase project with database access
- AWS CDK installed (`npm install -g aws-cdk`)

## Setup Steps

### 1. Database Setup

Apply the database schema to your Supabase project:

```bash
# Apply the schema to your Supabase project
psql -h your-project.supabase.co -U postgres -d postgres < database/schema.sql
```

Or run the SQL manually in the Supabase dashboard:
- Open SQL Editor in Supabase
- Copy and paste contents of `database/schema.sql`
- Run the script

### 2. Environment Configuration

Create a `.env` file with your configuration:

```bash
# Supabase Configuration
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_KEY=your-service-role-key

# GitHub Configuration (if using webhooks)
FLAWLESST_GITHUB_WEBHOOK_URL=https://your-api-domain/prod/webhooks/github
FLAWLESST_WEBHOOK_SECRET_BASE=your-webhook-secret
```

### 3. Install Dependencies

```bash
# Install root dependencies
npm install

# Install scanner dependencies
cd src/scanner
npm install
cd ../..
```

### 4. Build and Deploy Scanner Container

```bash
# Build and push the Docker image to ECR
./scripts/deploy-scanner.sh
```

This script will:
- Build the Docker image
- Create ECR repository if needed
- Push the image to ECR

### 5. Deploy Infrastructure

```bash
# Bootstrap CDK (only needed once)
npx cdk bootstrap

# Deploy the stack
npm run cdk:deploy
```

This will create:
- VPC and networking
- ECS cluster and task definition
- Lambda functions
- API Gateway with endpoints
- IAM roles and permissions

### 6. Test the Setup

```bash
# Set your API URL and key
export API_URL="https://your-api-gateway-url/prod"
export API_KEY="your-api-gateway-key"

# Run the test script
./scripts/test-accessibility-scan.sh
```

## API Usage

### Start Accessibility Scan

```bash
curl -X POST "https://your-api-url/prod/accessibility-scan" \
  -H "Content-Type: application/json" \
  -H "x-api-key: your-api-key" \
  -d '{
    "target_url": "https://example.com",
    "customer_id": "customer-uuid"
  }'
```

**Response:**
```json
{
  "scan_id": "scan-uuid",
  "status": "started",
  "message": "Accessibility scan started successfully"
}
```

### Check Scan Results

Query the `accessibility_scans` table in Supabase:

```sql
SELECT 
  id,
  target_url,
  scan_status,
  violation_count,
  scan_duration_ms,
  created_at,
  completed_at
FROM accessibility_scans 
WHERE customer_id = 'customer-uuid'
ORDER BY created_at DESC;
```

## Monitoring

### CloudWatch Logs

Monitor the Lambda function logs:
```bash
aws logs tail /aws/lambda/FlawlesstApiStack-AccessibilityScanLambda --follow
```

Monitor the Fargate container logs:
```bash
aws logs tail /aws/ecs/accessibility-scanner --follow
```

### ECS Tasks

Check running Fargate tasks:
```bash
aws ecs list-tasks --cluster accessibility-scan-cluster
```

## Troubleshooting

### Common Issues

1. **Container fails to start**
   - Check ECR image permissions
   - Verify task definition settings
   - Review CloudWatch logs

2. **Scan timeout**
   - Check target URL accessibility
   - Verify network configuration
   - Increase timeout settings

3. **Database connection issues**
   - Verify Supabase credentials
   - Check network connectivity
   - Review RLS policies

### Error Codes

- **400**: Invalid request (missing fields, invalid URL)
- **500**: Internal server error (infrastructure issues)
- **502**: Bad gateway (upstream service issues)

## Performance Considerations

### Scaling

- **Concurrent Scans**: Limited by Fargate task limits
- **Memory**: 2GB per container (configurable)
- **Timeout**: 30 seconds page load, 5 minutes total

### Cost Optimization

- Use Spot Instances for Fargate tasks
- Implement scan result caching
- Set up log retention policies

## Security

### Network Security

- VPC with private subnets
- Security groups restricting outbound traffic
- No inbound internet access required

### Data Protection

- Encrypted connections to Supabase
- No persistent data in containers
- API key authentication

### IAM Permissions

Least privilege access for:
- ECS task execution
- ECR image pulling
- CloudWatch logging

## Advanced Configuration

### Custom Scan Rules

Modify `src/scanner/scanner.ts` to add custom axe rules:

```typescript
// Custom axe configuration
const axeOptions = {
  rules: {
    'color-contrast': { enabled: true },
    'custom-rule': { enabled: true }
  }
};
```

### Additional Metrics

Add custom metrics to track:
- Scan success rates
- Average violation counts
- Performance metrics

### Webhook Integration

Set up webhooks to notify when scans complete:
```typescript
// Add to scanner.ts
await fetch(webhookUrl, {
  method: 'POST',
  body: JSON.stringify(scanResults)
});
```

## Maintenance

### Regular Tasks

1. **Update Dependencies**
   ```bash
   cd src/scanner
   npm update
   ```

2. **Rebuild Container**
   ```bash
   ./scripts/deploy-scanner.sh
   ```

3. **Monitor Costs**
   - Check AWS billing reports
   - Review CloudWatch metrics

### Backup Strategy

- Supabase automatic backups
- ECR image versioning
- Infrastructure as code (CDK)

## Support

For issues and questions:

1. Check CloudWatch logs
2. Review this documentation
3. Test with the provided scripts
4. Check AWS service health dashboard

## License

This project is part of the Flawlesst API suite.

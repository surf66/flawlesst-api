# Accessibility Scan Trigger Lambda

This Lambda function triggers accessibility scans by starting ephemeral AWS Fargate tasks that run Playwright with axe-core.

## Input

```json
{
  "target_url": "https://example.com",
  "customer_id": "customer-uuid"
}
```

## Output

### Success Response
```json
{
  "scan_id": "scan-uuid",
  "status": "started",
  "message": "Accessibility scan started successfully"
}
```

### Error Response
```json
{
  "scan_id": "",
  "status": "error",
  "message": "Error description"
}
```

## Environment Variables

- `SUPABASE_URL`: Supabase project URL
- `SUPABASE_SERVICE_KEY`: Supabase service role key
- `TASK_DEFINITION_ARN`: ARN of the Fargate task definition
- `CLUSTER_NAME`: ECS cluster name
- `SUBNETS`: Comma-separated list of subnet IDs
- `SECURITY_GROUPS`: Comma-separated list of security group IDs
- `ASSIGN_PUBLIC_IP`: Whether to assign public IP (true/false)
- `DEPLOYMENT_REGION`: AWS region for deployment

## Process

1. Validates input parameters
2. Creates a scan record in Supabase with 'pending' status
3. Starts a Fargate task with environment variables
4. Returns scan ID to caller

The Fargate container will:
- Update status to 'running'
- Perform the accessibility scan
- Store results in Supabase
- Update status to 'completed' or 'failed'

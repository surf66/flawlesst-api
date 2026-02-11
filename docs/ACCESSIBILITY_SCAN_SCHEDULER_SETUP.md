# Accessibility Scan Scheduler Setup Guide

This guide explains how to set up and configure the new accessibility scan scheduler that runs daily scans for all URLs in the `user_accessibility_urls` table.

## Overview

The accessibility scan scheduler provides two modes of operation:

1. **Individual Mode**: Original functionality for scanning specific URLs on demand
2. **Scheduled Mode**: Automatically scans all URLs from `user_accessibility_urls` table daily at 4am UTC

## Database Setup

### 1. Create the user_accessibility_urls table

```sql
-- Run the migration script
\i database/create_user_accessibility_urls_table.sql
```

### 2. Add name column to accessibility_scans table

```sql
-- Run the migration script  
\i database/add_name_to_accessibility_scans.sql
```

### 3. Add test data (optional)

```sql
-- Insert test URLs for scanning
INSERT INTO user_accessibility_urls (user_id, name, url) VALUES
  ('16e4a10b-2216-4ddb-b6e4-7a8453071fc2', 'Homepage', 'https://rentalcars.com'),
  ('16e4a10b-2216-4ddb-b6e4-7a8453071fc2', 'About Us', 'https://rentalcars.com/about'),
  ('16e4a10b-2216-4ddb-b6e4-7a8453071fc2', 'Contact', 'https://rentalcars.com/contact');
```

## Deployment

### 1. Deploy Infrastructure Changes

```bash
# Deploy the CDK stack with EventBridge scheduling
npm run deploy
```

This will create:
- EventBridge rule for daily 4am UTC scheduling
- Updated lambda function with dual-mode support
- Proper IAM permissions for EventBridge

### 2. Verify Deployment

Check the following in AWS Console:

1. **EventBridge**: Verify the `DailyAccessibilityScanRule` exists and is enabled
2. **Lambda**: Check that the accessibility scan lambda has the updated code
3. **IAM**: Ensure EventBridge has permissions to invoke the lambda

## API Usage

### Individual Mode (Backward Compatible)

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

### Scheduled Mode

```bash
curl -X POST \
  -H "Content-Type: application/json" \
  -H "x-api-key: YOUR_API_KEY" \
  -d '{
    "mode": "scheduled"
  }' \
  https://your-api-url/prod/accessibility-scan
```

### Manual Scheduled Trigger

You can also manually trigger the scheduled mode for testing:

```bash
# This will scan all URLs in user_accessibility_urls table
curl -X POST \
  -H "Content-Type: application/json" \
  -H "x-api-key: YOUR_API_KEY" \
  -d '{
    "mode": "scheduled",
    "user_id": "specific-user-uuid"  # Optional: scan only for specific user
  }' \
  https://your-api-url/prod/accessibility-scan
```

## Monitoring

### CloudWatch Logs

Monitor the following log groups:

1. **Lambda Logs**: `/aws/lambda/FlawlesstApiStack-AccessibilityScanLambda-XXXXX`
2. **Fargate Logs**: `/ecs/accessibility-scanner`

### EventBridge Monitoring

1. Go to EventBridge in AWS Console
2. Check the `DailyAccessibilityScanRule` metrics
3. Monitor for successful invocations and any failures

### Database Monitoring

Monitor scan results in the `accessibility_scans` table:

```sql
-- Check recent scans
SELECT * FROM accessibility_scans 
ORDER BY created_at DESC 
LIMIT 10;

-- Check scan statistics
SELECT 
  name,
  COUNT(*) as total_scans,
  COUNT(CASE WHEN scan_status = 'completed' THEN 1 END) as successful_scans,
  COUNT(CASE WHEN scan_status = 'failed' THEN 1 END) as failed_scans,
  AVG(violation_count) as avg_violations
FROM accessibility_scans 
WHERE created_at >= NOW() - INTERVAL '7 days'
GROUP BY name;
```

## Troubleshooting

### Common Issues

1. **EventBridge Rule Not Triggering**
   - Check if the rule is enabled
   - Verify the lambda has proper permissions
   - Check CloudWatch logs for EventBridge

2. **No URLs Found in Scheduled Mode**
   - Verify data exists in `user_accessibility_urls` table
   - Check RLS policies if using service key
   - Ensure proper user_id values

3. **Fargate Task Failures**
   - Check VPC and security group configuration
   - Verify subnet accessibility
   - Monitor Fargate logs for detailed errors

### Testing

Run the test script to verify functionality:

```bash
# Set environment variables
export API_URL="https://your-api-url.com/prod"
export API_KEY="your-api-key"

# Run tests
./scripts/test-scheduled-accessibility-scan.sh
```

## Configuration

### Changing Schedule Time

Modify the schedule in `lib/flawlesst-api-stack.ts`:

```typescript
schedule: events.Schedule.cron({
  minute: '0',
  hour: '4',  // Change this to desired hour (UTC)
  month: '*',
  weekDay: '*',
  year: '*'
})
```

### Adding/Removing Environment Variables

Update the lambda environment variables in the CDK stack:

```typescript
environment: {
  // Add new variables here
  NEW_VARIABLE: 'value',
}
```

## Security Considerations

1. **RLS Policies**: Ensure proper Row Level Security is enabled on both tables
2. **Service Key**: Use service role key for lambda functions, not anon key
3. **API Security**: Keep API keys secure and rotate regularly
4. **VPC Configuration**: Ensure Fargate tasks have proper network isolation

## Performance Optimization

1. **Batch Processing**: The scheduled mode processes URLs sequentially to avoid overwhelming the system
2. **Error Isolation**: Failed individual scans don't prevent other URLs from being scanned
3. **Resource Limits**: Monitor Fargate task memory and CPU usage
4. **Database Indexing**: Ensure proper indexes exist on frequently queried columns

## Future Enhancements

Consider these improvements for production:

1. **Parallel Processing**: Process multiple URLs concurrently with proper rate limiting
2. **Retry Logic**: Implement exponential backoff for failed scans
3. **Custom Schedules**: Allow users to set custom scan frequencies
4. **Scan Notifications**: Send alerts when scans complete or fail
5. **Historical Reporting**: Track scan trends and improvements over time

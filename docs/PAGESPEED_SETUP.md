# PageSpeed Insights Integration Setup

This document describes the setup and usage of the Google PageSpeed Insights integration for the Flawlesst API.

## Overview

The PageSpeed Insights integration provides:
- **Manual Scanning**: Trigger scans on-demand for any URL
- **Scheduled Scanning**: Automatic daily scans at 4AM UTC for all user URLs
- **Core Web Vitals Tracking**: Performance, SEO, accessibility, and best practices scores
- **Historical Data**: Store and analyze trends over time
- **Analytics Dashboard**: View trends, improvements, and performance metrics

## API Endpoints

### 1. Trigger PageSpeed Scan
**POST** `/pagespeed-scan`

Triggers a PageSpeed scan for a specific URL.

#### Request Body:
```json
{
  "target_url": "https://example.com",
  "customer_id": "uuid-of-customer",
  "strategy": "desktop" | "mobile" (optional, defaults to desktop)
}
```

#### Response:
```json
{
  "scan_id": "uuid-of-scan",
  "status": "completed",
  "message": "PageSpeed scan completed successfully"
}
```

### 2. Get PageSpeed Results
**GET** `/pagespeed-scan/results`

Retrieves historical PageSpeed scan results.

#### Query Parameters:
- `customer_id` (required): UUID of the customer
- `target_url` (optional): Specific URL to filter by
- `days_back` (optional, default 30): Number of days to look back
- `strategy` (optional): 'desktop' or 'mobile'

#### Response:
```json
{
  "results": [
    {
      "id": "scan-uuid",
      "target_url": "https://example.com",
      "performance_score": 85,
      "first_contentful_paint": 1200,
      "largest_contentful_paint": 2400,
      "first_input_delay": 50,
      "cumulative_layout_shift": 0.1,
      "seo_score": 90,
      "accessibility_score": 95,
      "best_practices_score": 88,
      "strategy": "desktop",
      "scan_status": "completed",
      "created_at": "2024-01-15T04:00:00Z",
      "completed_at": "2024-01-15T04:01:30Z",
      "scan_duration_ms": 90000
    }
  ],
  "total_count": 1,
  "message": "PageSpeed results retrieved successfully"
}
```

### 3. Get PageSpeed Analytics
**GET** `/pagespeed-scan/analytics`

Retrieves analytics and trend data for PageSpeed scans.

#### Query Parameters:
- `customer_id` (required): UUID of the customer
- `target_url` (optional): Specific URL to filter by
- `days_back` (optional, default 30): Number of days to look back
- `strategy` (optional, default 'desktop'): 'desktop' or 'mobile'

#### Response:
```json
{
  "analytics": [
    {
      "target_url": "https://example.com",
      "strategy": "desktop",
      "current_score": 85,
      "previous_score": 82,
      "score_change": 3,
      "trend": "improving",
      "trend_data": [
        {
          "date": "2024-01-15",
          "performance_score": 85,
          "first_contentful_paint": 1200,
          "largest_contentful_paint": 2400,
          "first_input_delay": 50,
          "cumulative_layout_shift": 0.1
        }
      ],
      "stats": {
        "avg_score": 83,
        "min_score": 78,
        "max_score": 85,
        "total_scans": 7,
        "scan_frequency": 1.8
      }
    }
  ],
  "overall_summary": {
    "total_urls": 1,
    "overall_avg_score": 85,
    "total_scans": 7,
    "improvement_rate": 100
  },
  "message": "PageSpeed analytics retrieved successfully"
}
```

## Database Schema

### pagespeed_scans Table

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| customer_id | UUID | Customer identifier |
| target_url | TEXT | URL that was scanned |
| scan_status | VARCHAR | Status: pending/running/completed/failed |
| performance_score | INTEGER | Performance score (0-100) |
| first_contentful_paint | INTEGER | FCP in milliseconds |
| largest_contentful_paint | INTEGER | LCP in milliseconds |
| first_input_delay | INTEGER | FID in milliseconds |
| cumulative_layout_shift | DECIMAL | CLS value |
| seo_score | INTEGER | SEO score (0-100) |
| accessibility_score | INTEGER | Accessibility score (0-100) |
| best_practices_score | INTEGER | Best practices score (0-100) |
| full_response | JSONB | Complete PageSpeed API response |
| strategy | VARCHAR | 'desktop' or 'mobile' |
| error_message | TEXT | Error details if failed |
| scan_duration_ms | INTEGER | Scan duration in milliseconds |
| created_at | TIMESTAMP | When scan was created |
| updated_at | TIMESTAMP | When scan was last updated |
| completed_at | TIMESTAMP | When scan completed |

## Setup Instructions

### 1. Database Setup

Run the database migration script:

```bash
# Run the PageSpeed schema creation
psql -h your-host -U your-user -d your-database -f database/create_pagespeed_scans_table.sql
```

### 2. Environment Variables

Add the following environment variables to your CDK deployment:

```bash
# Google PageSpeed Insights API Key
export GOOGLE_PAGESPEED_API_KEY="your-google-pagespeed-api-key"

# Existing Supabase variables (should already be set)
export SUPABASE_URL="your-supabase-url"
export SUPABASE_SERVICE_KEY="your-supabase-service-key"
```

### 3. Get Google PageSpeed API Key

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing project
3. Enable the PageSpeed Insights API
4. Create credentials (API Key)
5. Copy the API key and set it as `GOOGLE_PAGESPEED_API_KEY`

### 4. Deploy the Infrastructure

```bash
# Install dependencies
npm install

# Deploy the CDK stack
npm run cdk:deploy
```

### 5. Test the Integration

```bash
# Test manual scan
curl -X POST "https://your-api-url/prod/pagespeed-scan" \
  -H "x-api-key: your-api-key" \
  -H "Content-Type: application/json" \
  -d '{
    "target_url": "https://google.com",
    "customer_id": "test-customer-id",
    "strategy": "desktop"
  }'

# Get results
curl -X GET "https://your-api-url/prod/pagespeed-scan/results?customer_id=test-customer-id" \
  -H "x-api-key: your-api-key"

# Get analytics
curl -X GET "https://your-api-url/prod/pagespeed-scan/analytics?customer_id=test-customer-id" \
  -H "x-api-key: your-api-key"
```

## Scheduled Scans

The system automatically runs PageSpeed scans daily at 4AM UTC for all URLs in the `user_accessibility_urls` table. The scheduled scan:

1. Fetches all URLs from `user_accessibility_urls`
2. Creates a scan record for each URL
3. Calls the PageSpeed Insights API
4. Stores results in the `pagespeed_scans` table
5. Uses desktop strategy by default (configurable)

## Core Web Vitals Explained

### Performance Score (0-100)
Overall performance score based on multiple metrics.

### First Contentful Paint (FCP)
Time until the first piece of content is rendered. Target: < 1.8s

### Largest Contentful Paint (LCP)
Time until the largest content element is visible. Target: < 2.5s

### First Input Delay (FID)
Time from user interaction to browser response. Target: < 100ms

### Cumulative Layout Shift (CLS)
Measure of unexpected layout shifts. Target: < 0.1

## Usage Examples

### Monitoring a Website's Performance

```javascript
// Trigger a scan
const scanResponse = await fetch('/pagespeed-scan', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-api-key': apiKey
  },
  body: JSON.stringify({
    target_url: 'https://mywebsite.com',
    customer_id: 'customer-uuid',
    strategy: 'mobile'
  })
});

// Get historical data
const resultsResponse = await fetch('/pagespeed-scan/results?customer_id=customer-uuid&days_back=30', {
  headers: { 'x-api-key': apiKey }
});

// Get analytics and trends
const analyticsResponse = await fetch('/pagespeed-scan/analytics?customer_id=customer-uuid', {
  headers: { 'x-api-key': apiKey }
});
```

### Building a Dashboard

Use the analytics endpoint to display:
- Current performance scores
- Historical trends
- Improvement/decline indicators
- Core Web Vitals over time
- Scan frequency and reliability

## Troubleshooting

### Common Issues

1. **API Key Errors**: Ensure `GOOGLE_PAGESPEED_API_KEY` is set and valid
2. **Database Connection**: Check Supabase URL and service key
3. **URL Validation**: Ensure URLs are properly formatted and accessible
4. **Rate Limiting**: Google PageSpeed API has rate limits - handle gracefully

### Monitoring

Check CloudWatch logs for:
- Lambda execution errors
- API call failures
- Database connection issues
- Scheduled scan execution

### Performance Considerations

- Each scan takes 30-90 seconds
- Scheduled scans run in parallel for multiple URLs
- Consider implementing rate limiting for manual scans
- Monitor API quota usage from Google

## Security

- API endpoints require API key authentication
- Row-level security enabled on database tables
- Service role key used for server-side operations
- URLs validated before processing

## Future Enhancements

- Add mobile strategy to scheduled scans
- Implement alerting for performance degradation
- Add competitor comparison features
- Export functionality for reports
- Integration with monitoring tools

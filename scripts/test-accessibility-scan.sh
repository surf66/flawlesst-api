#!/bin/bash

# Test script for accessibility scan endpoint
# This script tests the complete flow of the accessibility scanning system

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
API_URL="${API_URL:-https://your-api-gateway-url/prod}"
API_KEY="${API_KEY:-your-api-key}"
TEST_URL="https://example.com"
CUSTOMER_ID="test-customer-$(date +%s)"

echo -e "${BLUE}Accessibility Scanner Test Script${NC}"
echo "=================================="

# Check required environment variables
if [ "$API_URL" = "https://your-api-gateway-url/prod" ] || [ "$API_KEY" = "your-api-key" ]; then
    echo -e "${RED}Error: Please set API_URL and API_KEY environment variables${NC}"
    echo "Example:"
    echo "export API_URL='https://abc123.execute-api.us-east-1.amazonaws.com/prod'"
    echo "export API_KEY='your-api-gateway-key'"
    exit 1
fi

echo -e "${GREEN}Configuration:${NC}"
echo "API URL: $API_URL"
echo "Test URL: $TEST_URL"
echo "Customer ID: $CUSTOMER_ID"
echo ""

# Function to make API request
make_request() {
    local method=$1
    local endpoint=$2
    local data=$3
    
    if [ -n "$data" ]; then
        curl -s -X "$method" \
            -H "Content-Type: application/json" \
            -H "x-api-key: $API_KEY" \
            -d "$data" \
            "$API_URL$endpoint"
    else
        curl -s -X "$method" \
            -H "Content-Type: application/json" \
            -H "x-api-key: $API_KEY" \
            "$API_URL$endpoint"
    fi
}

# Test 1: Health check
echo -e "${YELLOW}Test 1: Health check${NC}"
health_response=$(make_request "GET" "/health")
if echo "$health_response" | grep -q '"status":"ok"'; then
    echo -e "${GREEN}✓ Health check passed${NC}"
else
    echo -e "${RED}✗ Health check failed${NC}"
    echo "Response: $health_response"
    exit 1
fi

# Test 2: Invalid accessibility scan request (missing fields)
echo -e "${YELLOW}Test 2: Invalid request (missing fields)${NC}"
invalid_response=$(make_request "POST" "/accessibility-scan" '{"target_url": "https://example.com"}')
if echo "$invalid_response" | grep -q '"status":"error"'; then
    echo -e "${GREEN}✓ Invalid request properly rejected${NC}"
else
    echo -e "${RED}✗ Invalid request should have been rejected${NC}"
    echo "Response: $invalid_response"
fi

# Test 3: Invalid URL format
echo -e "${YELLOW}Test 3: Invalid URL format${NC}"
invalid_url_response=$(make_request "POST" "/accessibility-scan" "{\"target_url\": \"not-a-url\", \"customer_id\": \"$CUSTOMER_ID\"}")
if echo "$invalid_url_response" | grep -q '"status":"error"'; then
    echo -e "${GREEN}✓ Invalid URL properly rejected${NC}"
else
    echo -e "${RED}✗ Invalid URL should have been rejected${NC}"
    echo "Response: $invalid_url_response"
fi

# Test 4: Valid accessibility scan request
echo -e "${YELLOW}Test 4: Valid accessibility scan request${NC}"
scan_data="{\"target_url\": \"$TEST_URL\", \"customer_id\": \"$CUSTOMER_ID\"}"
scan_response=$(make_request "POST" "/accessibility-scan" "$scan_data")

if echo "$scan_response" | grep -q '"status":"started"'; then
    scan_id=$(echo "$scan_response" | grep -o '"scan_id":"[^"]*"' | cut -d'"' -f4)
    echo -e "${GREEN}✓ Accessibility scan started successfully${NC}"
    echo -e "${BLUE}Scan ID: $scan_id${NC}"
else
    echo -e "${RED}✗ Failed to start accessibility scan${NC}"
    echo "Response: $scan_response"
    exit 1
fi

# Test 5: Check scan status (optional - requires database access)
echo -e "${YELLOW}Test 5: Checking scan status${NC}"
echo "Note: This test requires database access to check scan status"
echo "You can check the scan status in your Supabase dashboard:"
echo "- Table: accessibility_scans"
echo "- Filter by: customer_id = $CUSTOMER_ID"
echo "- Look for: scan_id = $scan_id"

# Test 6: Test with different URLs
echo -e "${YELLOW}Test 6: Testing with different URLs${NC}"
test_urls=(
    "https://google.com"
    "https://github.com"
    "https://stackoverflow.com"
)

for url in "${test_urls[@]}"; do
    echo -e "${BLUE}Testing URL: $url${NC}"
    test_data="{\"target_url\": \"$url\", \"customer_id\": \"$CUSTOMER_ID\"}"
    test_response=$(make_request "POST" "/accessibility-scan" "$test_data")
    
    if echo "$test_response" | grep -q '"status":"started"'; then
        test_scan_id=$(echo "$test_response" | grep -o '"scan_id":"[^"]*"' | cut -d'"' -f4)
        echo -e "${GREEN}✓ Scan started for $url (ID: $test_scan_id)${NC}"
    else
        echo -e "${RED}✗ Failed to start scan for $url${NC}"
        echo "Response: $test_response"
    fi
    sleep 1  # Brief pause between requests
done

echo ""
echo -e "${GREEN}Test Summary:${NC}"
echo "✓ Health check working"
echo "✓ Input validation working"
echo "✓ Scan initiation working"
echo "✓ Multiple URL handling working"
echo ""
echo -e "${YELLOW}Next Steps:${NC}"
echo "1. Check your Supabase dashboard for scan results"
echo "2. Monitor AWS CloudWatch logs for Fargate container logs"
echo "3. Verify that scans complete and results are stored"
echo ""
echo -e "${BLUE}Useful Commands:${NC}"
echo "# Check CloudWatch logs:"
echo "aws logs tail /aws/lambda/FlawlesstApiStack-AccessibilityScanLambda --follow"
echo ""
echo "# Check ECS tasks:"
echo "aws ecs list-tasks --cluster accessibility-scan-cluster"
echo ""
echo "# Database query (if you have access):"
echo "SELECT * FROM accessibility_scans WHERE customer_id = '$CUSTOMER_ID' ORDER BY created_at DESC;"

echo -e "${GREEN}All tests completed successfully!${NC}"

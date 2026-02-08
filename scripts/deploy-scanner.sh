#!/bin/bash

# Deployment script for accessibility scanner
# This script builds and pushes the Docker image to ECR

set -e

# Configuration
REGION="eu-west-2"  # Change to your preferred region
REPOSITORY_NAME="accessibility-scanner"
IMAGE_TAG="latest"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}Starting accessibility scanner deployment...${NC}"

# Get AWS account ID
AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
if [ -z "$AWS_ACCOUNT_ID" ]; then
    echo -e "${RED}Error: Could not get AWS account ID. Make sure AWS CLI is configured.${NC}"
    exit 1
fi

echo -e "${GREEN}AWS Account ID: $AWS_ACCOUNT_ID${NC}"

# Set ECR repository URI
ECR_URI="${AWS_ACCOUNT_ID}.dkr.ecr.${REGION}.amazonaws.com"
REPOSITORY_URI="${ECR_URI}/${REPOSITORY_NAME}"

echo -e "${GREEN}ECR Repository: $REPOSITORY_URI${NC}"

# Navigate to scanner directory
cd "$(dirname "$0")/../src/scanner"

# Check if Dockerfile exists
if [ ! -f "Dockerfile" ]; then
    echo -e "${RED}Error: Dockerfile not found in scanner directory${NC}"
    exit 1
fi

# Login to ECR
echo -e "${YELLOW}Logging into ECR...${NC}"
aws ecr get-login-password --region $REGION | docker login --username AWS --password-stdin $ECR_URI

# Create ECR repository if it doesn't exist
echo -e "${YELLOW}Checking ECR repository...${NC}"
if ! aws ecr describe-repositories --repository-names $REPOSITORY_NAME --region $REGION >/dev/null 2>&1; then
    echo -e "${YELLOW}Creating ECR repository: $REPOSITORY_NAME${NC}"
    aws ecr create-repository \
        --repository-name $REPOSITORY_NAME \
        --region $REGION \
        --image-scanning-configuration scanOnPush=true \
        --image-tag-mutability MUTABLE
fi

# Build Docker image
echo -e "${YELLOW}Building Docker image...${NC}"
docker build -t $REPOSITORY_NAME:$IMAGE_TAG .

# Tag the image for ECR
echo -e "${YELLOW}Tagging image for ECR...${NC}"
docker tag $REPOSITORY_NAME:$IMAGE_TAG $REPOSITORY_URI:$IMAGE_TAG

# Push to ECR
echo -e "${YELLOW}Pushing image to ECR...${NC}"
docker push $REPOSITORY_URI:$IMAGE_TAG

echo -e "${GREEN}Deployment completed successfully!${NC}"
echo -e "${GREEN}Image pushed to: $REPOSITORY_URI:$IMAGE_TAG${NC}"

# Display next steps
echo -e "${YELLOW}Next steps:${NC}"
echo "1. Deploy the CDK stack: npm run cdk:deploy"
echo "2. Update any environment variables if needed"
echo "3. Test the accessibility scan endpoint"

# Optional: Clean up local image
read -p "Do you want to remove the local Docker image? (y/N): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo -e "${YELLOW}Cleaning up local image...${NC}"
    docker rmi $REPOSITORY_NAME:$IMAGE_TAG $REPOSITORY_URI:$IMAGE_TAG 2>/dev/null || true
    echo -e "${GREEN}Cleanup completed.${NC}"
fi

echo -e "${GREEN}Script completed successfully!${NC}"

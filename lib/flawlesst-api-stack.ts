import { Stack, StackProps, Duration, CfnOutput } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigw from 'aws-cdk-lib/aws-apigateway';
import * as nodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as path from 'path';

export class FlawlesstApiStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    const healthLambda = new nodejs.NodejsFunction(this, 'HealthLambda', {
      runtime: lambda.Runtime.NODEJS_20_X,
      entry: path.join(__dirname, '../src/lambdas/health/index.ts'),
      handler: 'handler',
      memorySize: 256,
      timeout: Duration.seconds(5),
    });

    // Create REST API
    const api = new apigw.RestApi(this, 'FlawlesstApi', {
      restApiName: 'Flawlesst API',
      description: 'Flawlesst API Gateway',
      defaultCorsPreflightOptions: {
        allowOrigins: apigw.Cors.ALL_ORIGINS,
        allowMethods: apigw.Cors.ALL_METHODS
      },
      deployOptions: {
        stageName: 'prod',
        throttlingRateLimit: 10,  // 10 requests per second
        throttlingBurstLimit: 2,  // Allow bursts of up to 2 requests
      },
    });

    // Import existing API key
    // Replace 'YOUR_EXISTING_API_KEY_ID' with your actual API key ID from AWS Console
    const apiKeyId = 'navd8b89y7';
    const apiKey = apigw.ApiKey.fromApiKeyId(this, 'ImportedApiKey', apiKeyId);

    // Create usage plan
    const plan = api.addUsagePlan('FlawlesstUsagePlan', {
      name: 'Basic',
      description: 'Basic usage plan with rate limiting',
      apiStages: [{
        api: api,
        stage: api.deploymentStage
      }],
      throttle: {
        rateLimit: 10,    // 10 requests per second
        burstLimit: 2,    // Allow bursts of up to 2 requests
      }
    });

    // Add the API key to the usage plan
    plan.addApiKey(apiKey);

    // Add resource and method with API key required
    const healthResource = api.root.addResource('health');
    healthResource.addMethod('GET', new apigw.LambdaIntegration(healthLambda), {
      apiKeyRequired: false,
      operationName: 'GetHealth',
      methodResponses: [{
        statusCode: '200',
        responseModels: {
          'application/json': apigw.Model.EMPTY_MODEL
        }
      }]
    });

    // Output the API URL and API key information
    new CfnOutput(this, 'ApiUrl', {
      value: api.url || 'Unknown',
      description: 'The base URL of the API Gateway',
    });

    new CfnOutput(this, 'ApiKeyId', {
      value: apiKey.keyId,
      description: 'The ID of the imported API key',
    });

    new CfnOutput(this, 'ApiKeyInfo', {
      value: 'Using existing API key. Key value is not shown for security reasons.',
      description: 'API Key Information',
    });

    new CfnOutput(this, 'ApiUsage', {
      value: `curl -H "x-api-key: [YOUR_API_KEY]" ${api.url}health`,
      description: 'Example cURL command to test the API (replace [YOUR_API_KEY] with your actual API key)',
    });
  }
}

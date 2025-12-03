import { Stack, StackProps, Duration, CfnOutput } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigwv2 from 'aws-cdk-lib/aws-apigatewayv2';
import * as apigwv2Integrations from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import * as apigwv2Authorizers from 'aws-cdk-lib/aws-apigatewayv2-authorizers';
import * as ssm from 'aws-cdk-lib/aws-ssm';
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

    // Create SSM parameter for the API key
    const apiKeyParam = new ssm.StringParameter(this, 'ApiKeyParameter', {
      parameterName: '/flawlesst/api-keys/default',
      stringValue: 'your-secure-api-key-here', // In production, generate a secure random key
      description: 'API Key for Flawlesst API',
      type: ssm.ParameterType.SECURE_STRING,
    });

    // Create a custom authorizer Lambda function
    const authorizerLambda = new nodejs.NodejsFunction(this, 'ApiKeyAuthorizer', {
      runtime: lambda.Runtime.NODEJS_20_X,
      entry: path.join(__dirname, '../src/lambdas/authorizer/index.ts'),
      handler: 'handler',
      environment: {
        API_KEY_PARAMETER_NAME: apiKeyParam.parameterName,
      },
    });

    // Grant the Lambda permission to read the parameter
    apiKeyParam.grantRead(authorizerLambda);

    // Create HTTP API with API key authorization
    const httpApi = new apigwv2.HttpApi(this, 'FlawlesstHttpApi', {
      apiName: 'flawlesst-http-api',
      createDefaultStage: true,
    });

    // Create a request authorizer
    const authorizer = new apigwv2Authorizers.HttpLambdaAuthorizer('ApiKeyAuthorizer', authorizerLambda, {
      authorizerName: 'api-key-authorizer',
      identitySource: ['$request.header.x-api-key'],
      responseTypes: [apigwv2Authorizers.HttpLambdaResponseType.SIMPLE],
    });

    // Add route with API key authorization
    httpApi.addRoutes({
      path: '/health',
      methods: [apigwv2.HttpMethod.GET],
      integration: new apigwv2Integrations.HttpLambdaIntegration('HealthIntegration', healthLambda),
      authorizer,
    });

    // Output the API URL and usage information
    new CfnOutput(this, 'ApiUrl', {
      value: httpApi.url || 'Unknown',
      description: 'The URL of the HTTP API',
    });

    new CfnOutput(this, 'ApiKeyParameterInfo', {
      value: apiKeyParam.parameterName,
      description: 'Parameter Store path containing the API key',
    });

    new CfnOutput(this, 'ApiKeyUsage', {
      value: `curl -H "x-api-key: your-api-key" ${httpApi.url}health`,
      description: 'Example cURL command to test the API',
    });
  }
}

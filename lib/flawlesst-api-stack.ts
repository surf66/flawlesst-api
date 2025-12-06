import { Stack, StackProps, Duration, CfnOutput } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigw from 'aws-cdk-lib/aws-apigateway';
import * as nodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as sfn from 'aws-cdk-lib/aws-stepfunctions';
import * as tasks from 'aws-cdk-lib/aws-stepfunctions-tasks';
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

    const sourceBucket = new s3.Bucket(this, 'SourceCodeBucket', {
      versioned: false,
    });

    const cloneRepoLambda = new nodejs.NodejsFunction(this, 'CloneRepoLambda', {
      runtime: lambda.Runtime.NODEJS_20_X,
      entry: path.join(__dirname, '../src/lambdas/clone-repo/index.ts'),
      handler: 'handler',
      memorySize: 512,
      timeout: Duration.seconds(60),
    });

    sourceBucket.grantWrite(cloneRepoLambda);

    const cloneTask = new tasks.LambdaInvoke(this, 'CloneRepoTask', {
      lambdaFunction: cloneRepoLambda,
      payload: sfn.TaskInput.fromObject({
        'owner.$': '$.owner',
        'repo.$': '$.repo',
        'branch.$': '$.branch',
        'githubToken.$': '$.githubToken',
        'executionId.$': '$$.Execution.Id',
        sourceBucket: sourceBucket.bucketName,
      }),
      resultPath: '$.cloneResult',
    });

    // Create the explode-repo Lambda function
    const explodeRepoLambda = new nodejs.NodejsFunction(this, 'ExplodeRepoLambda', {
      runtime: lambda.Runtime.NODEJS_20_X,
      entry: path.join(__dirname, '../src/lambdas/explode-repo/index.ts'),
      handler: 'handler',
      memorySize: 1024, // May need more memory for large repos
      timeout: Duration.minutes(5),
      environment: {
        SOURCE_BUCKET: sourceBucket.bucketName,
      },
      // Dependencies are installed at the root level
      bundling: {
        nodeModules: [],
        forceDockerBundling: false,
      },
    });

    sourceBucket.grantReadWrite(explodeRepoLambda);

    const explodeTask = new tasks.LambdaInvoke(this, 'ExplodeRepoTask', {
      lambdaFunction: explodeRepoLambda,
      payload: sfn.TaskInput.fromObject({
        'Records': [{
          's3': {
            'bucket': {
              'name': sourceBucket.bucketName,
            },
            'object': {
              'key.$': '$.cloneResult.Payload.tarKey',
            },
          },
        }],
      }),
      resultPath: '$.explodeResult',
    });

    // Create the state machine with both tasks
    const definition = cloneTask
      .next(explodeTask);

    const stateMachine = new sfn.StateMachine(this, 'ConnectProjectStateMachine', {
      definition,
      timeout: Duration.minutes(15), // Increased timeout for the entire workflow
    });

    const startCloneLambda = new nodejs.NodejsFunction(this, 'StartCloneExecutionLambda', {
      runtime: lambda.Runtime.NODEJS_20_X,
      entry: path.join(__dirname, '../src/lambdas/start-clone-execution/index.ts'),
      handler: 'handler',
      memorySize: 256,
      timeout: Duration.seconds(10),
      environment: {
        STATE_MACHINE_ARN: stateMachine.stateMachineArn,
        SOURCE_BUCKET: sourceBucket.bucketName,
      },
    });

    stateMachine.grantStartExecution(startCloneLambda);

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
      apiKeyRequired: true,
      operationName: 'GetHealth',
      methodResponses: [{
        statusCode: '200',
        responseModels: {
          'application/json': apigw.Model.EMPTY_MODEL
        }
      }]
    });

    const cloneRepoResource = api.root.addResource('clone-repo');
    cloneRepoResource.addMethod('POST', new apigw.LambdaIntegration(startCloneLambda), {
      apiKeyRequired: true,
      operationName: 'StartCloneRepo',
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

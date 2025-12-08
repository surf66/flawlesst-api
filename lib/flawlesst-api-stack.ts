import { Stack, StackProps, Duration, CfnOutput } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigw from 'aws-cdk-lib/aws-apigateway';
import * as nodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as sfn from 'aws-cdk-lib/aws-stepfunctions';
import * as tasks from 'aws-cdk-lib/aws-stepfunctions-tasks';
import * as iam from 'aws-cdk-lib/aws-iam';
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
        'userId.$': '$.userId',
        'projectId.$': '$.projectId',
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
              'key.$': '$.cloneResult.Payload.sourceKey',
            },
          },
        }],
        'userId.$': '$.userId',
        'projectId.$': '$.projectId',
      }),
      resultPath: '$.explodeResult',
    });

    // Create the analyze-file Lambda function
    const analyzeFileLambda = new nodejs.NodejsFunction(this, 'AnalyzeFileLambda', {
      runtime: lambda.Runtime.NODEJS_20_X,
      entry: path.join(__dirname, '../src/lambdas/analyze-file/index.ts'),
      handler: 'handler',
      memorySize: 512,
      timeout: Duration.minutes(2),
      environment: {
        SOURCE_BUCKET: sourceBucket.bucketName,
        RESULTS_BUCKET: sourceBucket.bucketName,
      },
      bundling: {
        nodeModules: [],
        forceDockerBundling: false,
      },
    });

    sourceBucket.grantReadWrite(analyzeFileLambda);
    analyzeFileLambda.grantInvoke(new iam.ServicePrincipal('states.amazonaws.com'));

    // Create the aggregate-results Lambda function
    const aggregateResultsLambda = new nodejs.NodejsFunction(this, 'AggregateResultsLambda', {
      runtime: lambda.Runtime.NODEJS_20_X,
      entry: path.join(__dirname, '../src/lambdas/aggregate-results/index.ts'),
      handler: 'handler',
      memorySize: 1024,
      timeout: Duration.minutes(10),
      environment: {
        RESULTS_BUCKET: sourceBucket.bucketName,
        SUPABASE_URL: process.env.SUPABASE_URL ?? '',
        SUPABASE_SERVICE_KEY: process.env.SUPABASE_SERVICE_KEY ?? '',
      },
      bundling: {
        nodeModules: [],
        forceDockerBundling: false,
      },
    });

    sourceBucket.grantReadWrite(aggregateResultsLambda);
    aggregateResultsLambda.grantInvoke(new iam.ServicePrincipal('states.amazonaws.com'));

    // Create Map state for distributed file analysis
    const mapState = new sfn.Map(this, 'AnalyzeFilesMap', {
      inputPath: '$.explodeResult.Payload.filePaths',
      resultPath: '$.mapResults',
      maxConcurrency: 50, // Process up to 50 files in parallel
    });

    const analyzeTask = new tasks.LambdaInvoke(this, 'AnalyzeFileTask', {
      lambdaFunction: analyzeFileLambda,
      payload: sfn.TaskInput.fromObject({
        fileName: sfn.JsonPath.stringAt('$'),
        userId: sfn.JsonPath.stringAt('$.userId'),
        projectId: sfn.JsonPath.stringAt('$.projectId'),
        jobExecutionId: sfn.JsonPath.stringAt('$$.Execution.Id'),
      }),
      resultPath: sfn.JsonPath.DISCARD,
    });

    // Set up the map iterator
    mapState.iterator(analyzeTask);

    // Create the aggregation task
    const aggregateTask = new tasks.LambdaInvoke(this, 'AggregateResultsTask', {
      lambdaFunction: aggregateResultsLambda,
      payload: sfn.TaskInput.fromObject({
        userId: sfn.JsonPath.stringAt('$.userId'),
        projectId: sfn.JsonPath.stringAt('$.projectId'),
        jobExecutionId: sfn.JsonPath.stringAt('$$.Execution.Id'),
        filePaths: sfn.JsonPath.stringAt('$.explodeResult.Payload.filePaths'),
      }),
      resultPath: '$.aggregateResult',
    });

    // Create the state machine with Map-Reduce workflow
    const definition = cloneTask
      .next(explodeTask)
      .next(mapState)
      .next(aggregateTask);

    const stateMachine = new sfn.StateMachine(this, 'ConnectProjectStateMachine', {
      definition,
      timeout: Duration.minutes(30), // Increased timeout for Map-Reduce workflow
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

    // Connect project endpoint: registers a GitHub webhook for a repo
    const connectProjectLambda = new nodejs.NodejsFunction(this, 'ConnectProjectLambda', {
      runtime: lambda.Runtime.NODEJS_20_X,
      entry: path.join(__dirname, '../src/lambdas/connect-project/index.ts'),
      handler: 'handler',
      memorySize: 256,
      timeout: Duration.seconds(10),
      environment: {
        // Avoid referencing api.url here to prevent a circular dependency
        // This value should be provided from the deployment environment and
        // should point to the public GitHub webhook endpoint, e.g.
        // https://your-api-domain/prod/webhooks/github
        GITHUB_WEBHOOK_URL: process.env.FLAWLESST_GITHUB_WEBHOOK_URL ?? '',
        GITHUB_WEBHOOK_SECRET_BASE: process.env.FLAWLESST_WEBHOOK_SECRET_BASE ?? '',
        STATE_MACHINE_ARN: stateMachine.stateMachineArn,
        SOURCE_BUCKET: sourceBucket.bucketName,
      },
    });

    stateMachine.grantStartExecution(connectProjectLambda);

    const connectProjectResource = api.root.addResource('connect-project');
    connectProjectResource.addMethod('POST', new apigw.LambdaIntegration(connectProjectLambda), {
      apiKeyRequired: true,
      operationName: 'ConnectProject',
    });

    // Public GitHub webhook endpoint (GitHub posts push events here)
    const githubWebhookLambda = new nodejs.NodejsFunction(this, 'GitHubWebhookLambda', {
      runtime: lambda.Runtime.NODEJS_20_X,
      entry: path.join(__dirname, '../src/lambdas/github-webhook/index.ts'),
      handler: 'handler',
      memorySize: 256,
      timeout: Duration.seconds(10),
      environment: {
        GITHUB_WEBHOOK_SECRET_BASE: process.env.FLAWLESST_WEBHOOK_SECRET_BASE ?? '',
      },
    });

    const webhooksResource = api.root.addResource('webhooks');
    const githubWebhookResource = webhooksResource.addResource('github');
    githubWebhookResource.addMethod('POST', new apigw.LambdaIntegration(githubWebhookLambda), {
      apiKeyRequired: false,
      operationName: 'GitHubWebhook',
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

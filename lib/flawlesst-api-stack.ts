import { Stack, StackProps, Duration, CfnOutput, RemovalPolicy } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigw from 'aws-cdk-lib/aws-apigateway';
import * as nodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as sfn from 'aws-cdk-lib/aws-stepfunctions';
import * as tasks from 'aws-cdk-lib/aws-stepfunctions-tasks';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecr from 'aws-cdk-lib/aws-ecr';
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

    // Create VPC for Fargate tasks
    const vpc = new ec2.Vpc(this, 'AccessibilityScanVpc', {
      maxAzs: 2,
      natGateways: 1,
      subnetConfiguration: [
        {
          cidrMask: 24,
          name: 'public',
          subnetType: ec2.SubnetType.PUBLIC,
        },
        {
          cidrMask: 24,
          name: 'private',
          subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
        },
      ],
    });

    // Create security group for Fargate tasks
    const fargateSecurityGroup = new ec2.SecurityGroup(this, 'FargateSecurityGroup', {
      vpc: vpc,
      description: 'Security group for accessibility scanner Fargate tasks',
      allowAllOutbound: true,
    });

    // Allow outbound HTTPS traffic
    fargateSecurityGroup.addEgressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(443), 'Allow HTTPS outbound');
    fargateSecurityGroup.addEgressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(80), 'Allow HTTP outbound');

    // Create ECS Cluster
    const cluster = new ecs.Cluster(this, 'AccessibilityScanCluster', {
      vpc: vpc,
      clusterName: 'accessibility-scan-cluster',
    });

    // Create ECR Repository for the scanner image
    const scannerRepository = new ecr.Repository(this, 'AccessibilityScannerRepository', {
      repositoryName: 'accessibility-scanner',
      removalPolicy: RemovalPolicy.DESTROY, // Change to RETAIN for production
    });

    // Create Task Definition for the accessibility scanner
    const taskDefinition = new ecs.FargateTaskDefinition(this, 'AccessibilityScannerTask', {
      memoryLimitMiB: 2048,
      cpu: 1024,
      runtimePlatform: {
        cpuArchitecture: ecs.CpuArchitecture.X86_64,
        operatingSystemFamily: ecs.OperatingSystemFamily.LINUX,
      },
    });

    // Add container to task definition
    taskDefinition.addContainer('accessibility-scanner', {
      image: ecs.ContainerImage.fromEcrRepository(scannerRepository, 'latest'),
      logging: ecs.LogDrivers.awsLogs({ streamPrefix: 'accessibility-scanner' }),
      environment: {
        NODE_ENV: 'production',
      },
    });

    // Grant the task execution role permissions to pull from ECR
    if (taskDefinition.executionRole) {
      taskDefinition.executionRole.addManagedPolicy(
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AmazonECSTaskExecutionRolePolicy')
      );
    }

    // Create IAM role for the accessibility scan Lambda
    const accessibilityScanRole = new iam.Role(this, 'AccessibilityScanLambdaRole', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole'),
      ],
    });

    // Grant permissions to run ECS tasks
    accessibilityScanRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          'ecs:RunTask',
          'ecs:DescribeTasks',
          'ecs:StopTask',
        ],
        resources: [
          taskDefinition.taskDefinitionArn,
          cluster.clusterArn,
        ],
      })
    );

    // Grant permissions to pass the task execution role
    accessibilityScanRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['iam:PassRole'],
        resources: [taskDefinition.executionRole?.roleArn || ''],
      })
    );

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
        externalModules: ['@aws-sdk/client-s3', '@aws-sdk/client-bedrock-runtime'],
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
        DEPLOYMENT_REGION: this.region,
      },
      bundling: {
        nodeModules: [],
        forceDockerBundling: false,
        externalModules: ['@aws-sdk/client-s3', '@aws-sdk/client-bedrock-runtime'],
      },
    });

    sourceBucket.grantReadWrite(analyzeFileLambda);
    analyzeFileLambda.grantInvoke(new iam.ServicePrincipal('states.amazonaws.com'));

    // Grant Bedrock permissions for AI analysis
    analyzeFileLambda.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'bedrock:InvokeModel',
        'bedrock:InvokeModelWithResponseStream',
        'aws-marketplace:Subscribe',
        'aws-marketplace:ViewSubscriptions',
        'aws-marketplace:ListSubscriptions',
        'aws-marketplace:Unsubscribe',
        'aws-marketplace:DescribeSubscription'
      ],
      resources: [
        `arn:aws:bedrock:${this.region}::foundation-model/anthropic.claude-3-haiku-20240307-v1:0`,
        '*'
      ]
    }));

    // Grant Bedrock permissions for AI summary generation
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
        DEPLOYMENT_REGION: this.region,
      },
      bundling: {
        nodeModules: [],
        forceDockerBundling: false,
        externalModules: ['@aws-sdk/client-s3', '@aws-sdk/client-bedrock-runtime'],
      },
    });

    sourceBucket.grantReadWrite(aggregateResultsLambda);
    aggregateResultsLambda.grantInvoke(new iam.ServicePrincipal('states.amazonaws.com'));

    // Grant Bedrock permissions for AI summary generation
    aggregateResultsLambda.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'bedrock:InvokeModel',
        'bedrock:InvokeModelWithResponseStream',
        'aws-marketplace:Subscribe',
        'aws-marketplace:ViewSubscriptions',
        'aws-marketplace:ListSubscriptions',
        'aws-marketplace:Unsubscribe',
        'aws-marketplace:DescribeSubscription'
      ],
      resources: [
        `arn:aws:bedrock:${this.region}::foundation-model/anthropic.claude-3-haiku-20240307-v1:0`,
        '*'
      ]
    }));

    // Create Map state for distributed file analysis
    const mapState = new sfn.Map(this, 'AnalyzeFilesMap', {
      inputPath: '$.filePaths',
      resultPath: '$.mapResults',
      maxConcurrency: 50, // Process up to 50 files in parallel
    });

    const analyzeTask = new tasks.LambdaInvoke(this, 'AnalyzeFileTask', {
      lambdaFunction: analyzeFileLambda,
      payload: sfn.TaskInput.fromObject({
        fileName: sfn.JsonPath.stringAt('$'),
        userId: sfn.JsonPath.stringAt('$$.Execution.Input.userId'),
        projectId: sfn.JsonPath.stringAt('$$.Execution.Input.projectId'),
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
        filePaths: sfn.JsonPath.stringAt('$.filePaths'),
      }),
      resultPath: '$.aggregateResult',
    });

    // Clone/Explode State Machine Definition (will be defined after tasks are created)
    let cloneExplodeDefinition: sfn.Chain;
    let cloneExplodeStateMachine: sfn.StateMachine;

    // Analysis State Machine Definition
    const analysisDefinition = mapState.next(aggregateTask);

    const analysisStateMachine = new sfn.StateMachine(this, 'AnalysisStateMachine', {
      definition: analysisDefinition,
      timeout: Duration.minutes(30),
    });

    // Lambda to start analysis after explode completes
    const startAnalysisAfterExplodeLambda = new nodejs.NodejsFunction(this, 'StartAnalysisAfterExplodeLambda', {
      runtime: lambda.Runtime.NODEJS_20_X,
      entry: path.join(__dirname, '../src/lambdas/start-analysis-after-explode/index.ts'),
      handler: 'handler',
      memorySize: 256,
      timeout: Duration.seconds(10),
      environment: {
        ANALYSIS_STATE_MACHINE_ARN: analysisStateMachine.stateMachineArn,
      },
      bundling: {
        nodeModules: [],
        forceDockerBundling: false,
        externalModules: ['@aws-sdk/client-s3', '@aws-sdk/client-bedrock-runtime'],
      },
    });

    analysisStateMachine.grantStartExecution(startAnalysisAfterExplodeLambda);

    const startAnalysisAfterExplodeTask = new tasks.LambdaInvoke(this, 'StartAnalysisAfterExplodeTask', {
      lambdaFunction: startAnalysisAfterExplodeLambda,
      payload: sfn.TaskInput.fromObject({
        'userId.$': '$.userId',
        'projectId.$': '$.projectId',
        'autoStartAnalysis.$': '$.autoStartAnalysis',
        'analysisStateMachineArn.$': '$.analysisStateMachineArn',
        'explodeResult.$': '$.explodeResult',
      }),
      resultPath: '$.analysisStartResult',
    });

    // Now assign the complete definition and create the state machine
    cloneExplodeDefinition = cloneTask.next(explodeTask).next(startAnalysisAfterExplodeTask);

    cloneExplodeStateMachine = new sfn.StateMachine(this, 'CloneExplodeStateMachine', {
      definition: cloneExplodeDefinition,
      timeout: Duration.minutes(10),
    });

    const startCloneExecutionLambda = new nodejs.NodejsFunction(this, 'StartCloneExecutionLambda', {
      runtime: lambda.Runtime.NODEJS_20_X,
      entry: path.join(__dirname, '../src/lambdas/start-clone-execution/index.ts'),
      handler: 'handler',
      memorySize: 256,
      timeout: Duration.seconds(10),
      environment: {
        STATE_MACHINE_ARN: cloneExplodeStateMachine.stateMachineArn,
        ANALYSIS_STATE_MACHINE_ARN: analysisStateMachine.stateMachineArn,
        SOURCE_BUCKET: sourceBucket.bucketName,
      },
    });

    cloneExplodeStateMachine.grantStartExecution(startCloneExecutionLambda);
    analysisStateMachine.grantStartExecution(startCloneExecutionLambda);

    // Lambda to start analysis step function via API
    const startAnalysisLambda = new nodejs.NodejsFunction(this, 'StartAnalysisLambda', {
      runtime: lambda.Runtime.NODEJS_20_X,
      entry: path.join(__dirname, '../src/lambdas/start-analysis/index.ts'),
      handler: 'handler',
      memorySize: 256,
      timeout: Duration.seconds(10),
      environment: {
        ANALYSIS_STATE_MACHINE_ARN: analysisStateMachine.stateMachineArn,
        SOURCE_BUCKET: sourceBucket.bucketName,
      },
    });

    analysisStateMachine.grantStartExecution(startAnalysisLambda);
    sourceBucket.grantRead(startAnalysisLambda);

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
    cloneRepoResource.addMethod('POST', new apigw.LambdaIntegration(startCloneExecutionLambda), {
      apiKeyRequired: true,
      operationName: 'StartCloneRepo',
    });

    const analysisResource = api.root.addResource('analysis');
    analysisResource.addMethod('POST', new apigw.LambdaIntegration(startAnalysisLambda), {
      apiKeyRequired: true,
      operationName: 'StartAnalysis',
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
        CLONE_EXPLODE_STATE_MACHINE_ARN: cloneExplodeStateMachine.stateMachineArn,
        ANALYSIS_STATE_MACHINE_ARN: analysisStateMachine.stateMachineArn,
        SOURCE_BUCKET: sourceBucket.bucketName,
      },
    });

    cloneExplodeStateMachine.grantStartExecution(connectProjectLambda);
    analysisStateMachine.grantStartExecution(connectProjectLambda);

    const connectProjectResource = api.root.addResource('connect-project');
    connectProjectResource.addMethod('POST', new apigw.LambdaIntegration(connectProjectLambda), {
      apiKeyRequired: true,
      operationName: 'ConnectProject',
    });

    // Create a simple Lambda for starting the workflow
    const startWorkflowLambda = new nodejs.NodejsFunction(this, 'StartWorkflowLambda', {
      runtime: lambda.Runtime.NODEJS_20_X,
      entry: path.join(__dirname, '../src/lambdas/start-workflow/index.ts'),
      handler: 'handler',
      memorySize: 256,
      timeout: Duration.seconds(10),
      environment: {
        CLONE_EXPLODE_STATE_MACHINE_ARN: cloneExplodeStateMachine.stateMachineArn,
      },
      bundling: {
        nodeModules: [],
        forceDockerBundling: false,
        externalModules: ['@aws-sdk/client-s3', '@aws-sdk/client-bedrock-runtime'],
      },
    });

    cloneExplodeStateMachine.grantStartExecution(startWorkflowLambda);

    // Keep the start-workflow endpoint as an alternative way to start the workflow
    const startWorkflowResource = api.root.addResource('start-workflow');
    startWorkflowResource.addMethod('POST', new apigw.LambdaIntegration(startWorkflowLambda), {
      apiKeyRequired: true,
      operationName: 'StartWorkflow',
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

    // Project analysis summary endpoint
    const projectAnalysisSummaryLambda = new nodejs.NodejsFunction(this, 'ProjectAnalysisSummaryLambda', {
      runtime: lambda.Runtime.NODEJS_20_X,
      entry: path.join(__dirname, '../src/lambdas/project-analysis-summary/index.ts'),
      handler: 'handler',
      memorySize: 256,
      timeout: Duration.seconds(10),
      environment: {
        SUPABASE_URL: process.env.SUPABASE_URL ?? '',
        SUPABASE_SERVICE_KEY: process.env.SUPABASE_SERVICE_KEY ?? '',
      },
      bundling: {
        nodeModules: [],
        forceDockerBundling: false,
      },
    });

    const projectAnalysisSummaryResource = api.root.addResource('project-analysis-summary');
    const projectResource = projectAnalysisSummaryResource.addResource('{projectId}');
    projectResource.addMethod('GET', new apigw.LambdaIntegration(projectAnalysisSummaryLambda), {
      apiKeyRequired: true,
      operationName: 'GetProjectAnalysisSummary',
      methodResponses: [{
        statusCode: '200',
        responseModels: {
          'application/json': apigw.Model.EMPTY_MODEL
        }
      }]
    });

    // Get user projects endpoint
    const getUserProjectsLambda = new nodejs.NodejsFunction(this, 'GetUserProjectsLambda', {
      runtime: lambda.Runtime.NODEJS_20_X,
      entry: path.join(__dirname, '../src/lambdas/get-user-projects/index.ts'),
      handler: 'handler',
      memorySize: 256,
      timeout: Duration.seconds(10),
      environment: {
        SUPABASE_URL: process.env.SUPABASE_URL ?? '',
        SUPABASE_SERVICE_KEY: process.env.SUPABASE_SERVICE_KEY ?? '',
      },
      bundling: {
        nodeModules: [],
        forceDockerBundling: false,
      },
    });

    const getUserProjectsResource = api.root.addResource('get-user-projects');
    getUserProjectsResource.addMethod('GET', new apigw.LambdaIntegration(getUserProjectsLambda), {
      apiKeyRequired: true,
      operationName: 'GetUserProjects',
      methodResponses: [{
        statusCode: '200',
        responseModels: {
          'application/json': apigw.Model.EMPTY_MODEL
        }
      }]
    });

    // Accessibility scan endpoint
    const accessibilityScanLambda = new nodejs.NodejsFunction(this, 'AccessibilityScanLambda', {
      runtime: lambda.Runtime.NODEJS_20_X,
      entry: path.join(__dirname, '../src/lambdas/trigger-accessibility-scan/index.ts'),
      handler: 'handler',
      memorySize: 256,
      timeout: Duration.seconds(30),
      role: accessibilityScanRole,
      environment: {
        SUPABASE_URL: process.env.SUPABASE_URL ?? '',
        SUPABASE_SERVICE_KEY: process.env.SUPABASE_SERVICE_KEY ?? '',
        TASK_DEFINITION_ARN: taskDefinition.taskDefinitionArn,
        CLUSTER_NAME: cluster.clusterName,
        SUBNETS: vpc.privateSubnets.map(subnet => subnet.subnetId).join(','),
        SECURITY_GROUPS: fargateSecurityGroup.securityGroupId,
        ASSIGN_PUBLIC_IP: 'true', // Set to 'false' for production with NAT gateway
        DEPLOYMENT_REGION: this.region,
      },
      bundling: {
        nodeModules: ['@aws-sdk/client-ecs', '@supabase/supabase-js', 'uuid'],
        forceDockerBundling: false,
        externalModules: ['@aws-sdk/client-ecs'],
      },
    });

    const accessibilityScanResource = api.root.addResource('accessibility-scan');
    accessibilityScanResource.addMethod('POST', new apigw.LambdaIntegration(accessibilityScanLambda), {
      apiKeyRequired: true,
      operationName: 'TriggerAccessibilityScan',
      methodResponses: [{
        statusCode: '202',
        responseModels: {
          'application/json': apigw.Model.EMPTY_MODEL
        }
      }, {
        statusCode: '400',
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

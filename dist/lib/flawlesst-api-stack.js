"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.FlawlesstApiStack = void 0;
const aws_cdk_lib_1 = require("aws-cdk-lib");
const lambda = __importStar(require("aws-cdk-lib/aws-lambda"));
const apigwv2 = __importStar(require("aws-cdk-lib/aws-apigatewayv2"));
const apigwv2Integrations = __importStar(require("aws-cdk-lib/aws-apigatewayv2-integrations"));
const apigwv2Authorizers = __importStar(require("aws-cdk-lib/aws-apigatewayv2-authorizers"));
const ssm = __importStar(require("aws-cdk-lib/aws-ssm"));
const nodejs = __importStar(require("aws-cdk-lib/aws-lambda-nodejs"));
const path = __importStar(require("path"));
class FlawlesstApiStack extends aws_cdk_lib_1.Stack {
    constructor(scope, id, props) {
        super(scope, id, props);
        const healthLambda = new nodejs.NodejsFunction(this, 'HealthLambda', {
            runtime: lambda.Runtime.NODEJS_20_X,
            entry: path.join(__dirname, '../src/lambdas/health/index.ts'),
            handler: 'handler',
            memorySize: 256,
            timeout: aws_cdk_lib_1.Duration.seconds(5),
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
        new aws_cdk_lib_1.CfnOutput(this, 'ApiUrl', {
            value: httpApi.url || 'Unknown',
            description: 'The URL of the HTTP API',
        });
        new aws_cdk_lib_1.CfnOutput(this, 'ApiKeyParameterInfo', {
            value: apiKeyParam.parameterName,
            description: 'Parameter Store path containing the API key',
        });
        new aws_cdk_lib_1.CfnOutput(this, 'ApiKeyUsage', {
            value: `curl -H "x-api-key: your-api-key" ${httpApi.url}health`,
            description: 'Example cURL command to test the API',
        });
    }
}
exports.FlawlesstApiStack = FlawlesstApiStack;

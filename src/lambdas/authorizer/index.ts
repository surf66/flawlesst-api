import { SSMClient, GetParameterCommand } from '@aws-sdk/client-ssm';
import { APIGatewayRequestAuthorizerEvent, APIGatewayAuthorizerResult, Context } from 'aws-lambda';

const ssm = new SSMClient({ region: process.env.AWS_REGION });

export const handler = async (
  event: APIGatewayRequestAuthorizerEvent,
  _context: Context
): Promise<APIGatewayAuthorizerResult> => {
  try {
    // Get API key from header
    const apiKey = event.headers?.['x-api-key'] || event.headers?.['X-API-Key'];
    
    if (!apiKey) {
      console.log('No API key provided in request');
      return generatePolicy('user', 'Deny', event.methodArn);
    }

    // Get the valid API key from Parameter Store
    const parameterName = process.env.API_KEY_PARAMETER_NAME;
    if (!parameterName) {
      console.error('API_KEY_PARAMETER_NAME environment variable not set');
      return generatePolicy('user', 'Deny', event.methodArn);
    }

    // Fetch the valid API key from Parameter Store
    const command = new GetParameterCommand({
      Name: parameterName,
      WithDecryption: true,
    });

    const response = await ssm.send(command);
    const validApiKey = response.Parameter?.Value;

    if (!validApiKey) {
      console.error('No API key found in Parameter Store');
      return generatePolicy('user', 'Deny', event.methodArn);
    }

    // Check if the provided API key matches the one in Parameter Store
    if (apiKey !== validApiKey) {
      console.log('Invalid API key provided');
      return generatePolicy('user', 'Deny', event.methodArn);
    }

    // If we got here, the API key is valid
    return generatePolicy('user', 'Allow', event.methodArn, {
      apiKey: 'validated',
      // Add any additional context you want to pass to your Lambda functions
    });
  } catch (error) {
    console.error('Authorizer error:', error);
    return generatePolicy('user', 'Deny', event.methodArn);
  }
};

// Helper function to generate IAM policy
const generatePolicy = (
  principalId: string,
  effect: 'Allow' | 'Deny',
  resource: string,
  context?: Record<string, any>
): APIGatewayAuthorizerResult => {
  return {
    principalId,
    policyDocument: {
      Version: '2012-10-17',
      Statement: [
        {
          Action: 'execute-api:Invoke',
          Effect: effect,
          Resource: resource,
        },
      ],
    },
    context,
  };
};

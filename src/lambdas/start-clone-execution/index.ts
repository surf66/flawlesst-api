import { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { SFNClient, StartExecutionCommand } from '@aws-sdk/client-sfn';

const sfn = new SFNClient({});

const stateMachineArn = process.env.STATE_MACHINE_ARN as string;
const sourceBucket = process.env.SOURCE_BUCKET as string;

export const handler = async (
  event: APIGatewayProxyEventV2
): Promise<APIGatewayProxyResultV2> => {
  if (!stateMachineArn || !sourceBucket) {
    return {
      statusCode: 500,
      body: JSON.stringify({ message: 'State machine or bucket not configured' }),
    };
  }

  if (!event.body) {
    return {
      statusCode: 400,
      body: JSON.stringify({ message: 'Request body is required' }),
    };
  }

  let payload: any;
  try {
    payload = JSON.parse(event.body);
  } catch {
    return {
      statusCode: 400,
      body: JSON.stringify({ message: 'Invalid JSON body' }),
    };
  }

  const { owner, repo, branch = 'main', githubToken } = payload;

  if (!owner || !repo) {
    return {
      statusCode: 400,
      body: JSON.stringify({ message: 'owner and repo are required' }),
    };
  }

  const input = JSON.stringify({ owner, repo, branch, githubToken, sourceBucket });

  const command = new StartExecutionCommand({
    stateMachineArn,
    input,
  });

  const result = await sfn.send(command);

  return {
    statusCode: 202,
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      executionArn: result.executionArn,
      startDate: result.startDate,
    }),
  };
};

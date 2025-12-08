import { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { SFNClient, StartExecutionCommand } from '@aws-sdk/client-sfn';

const sfn = new SFNClient({});

const cloneExplodeStateMachineArn = process.env.CLONE_EXPLODE_STATE_MACHINE_ARN as string;
const analysisStateMachineArn = process.env.ANALYSIS_STATE_MACHINE_ARN as string;
const sourceBucket = process.env.SOURCE_BUCKET as string;

export const handler = async (
  event: APIGatewayProxyEventV2
): Promise<APIGatewayProxyResultV2> => {
  if (!cloneExplodeStateMachineArn || !sourceBucket) {
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

  const { owner, repo, branch = 'main', githubToken, userId, projectId, autoStartAnalysis = true } = payload;

  if (!owner || !repo || !userId || !projectId) {
    return {
      statusCode: 400,
      body: JSON.stringify({ message: 'owner, repo, userId, and projectId are required' }),
    };
  }

  const input = JSON.stringify({ 
    owner, 
    repo, 
    branch, 
    githubToken, 
    sourceBucket,
    userId,
    projectId,
    autoStartAnalysis,
    analysisStateMachineArn: autoStartAnalysis ? analysisStateMachineArn : undefined
  });

  const command = new StartExecutionCommand({
    stateMachineArn: cloneExplodeStateMachineArn,
    name: `clone-explode-${projectId}-${Date.now()}`,
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
      message: autoStartAnalysis ? 'Clone and analysis started' : 'Clone started',
    }),
  };
};

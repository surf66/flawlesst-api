import { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { SFNClient, StartExecutionCommand } from '@aws-sdk/client-sfn';

const sfn = new SFNClient({});

const cloneExplodeStateMachineArn = process.env.CLONE_EXPLODE_STATE_MACHINE_ARN as string;

export const handler = async (
  event: APIGatewayProxyEventV2
): Promise<APIGatewayProxyResultV2> => {
  if (!cloneExplodeStateMachineArn) {
    return {
      statusCode: 500,
      body: JSON.stringify({ message: 'State machine ARN not configured' }),
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

  if (!owner || !repo || !githubToken || !userId || !projectId) {
    return {
      statusCode: 400,
      body: JSON.stringify({ message: 'owner, repo, githubToken, userId, and projectId are required' }),
    };
  }

  try {
    const input = JSON.stringify({ 
      owner, 
      repo, 
      branch, 
      githubToken, 
      userId,
      projectId,
      autoStartAnalysis,
      sourceBucket: process.env.SOURCE_BUCKET,
      analysisStateMachineArn: autoStartAnalysis ? process.env.ANALYSIS_STATE_MACHINE_ARN : undefined
    });

    const command = new StartExecutionCommand({
      stateMachineArn: cloneExplodeStateMachineArn,
      name: `workflow-${projectId}-${Date.now()}`,
      input,
    });

    const result = await sfn.send(command);

    return {
      statusCode: 200,
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        executionArn: result.executionArn,
        startDate: result.startDate,
        input: JSON.parse(input),
        message: autoStartAnalysis ? 'Clone, explode, and analysis workflow started' : 'Clone and explode workflow started',
      }),
    };
  } catch (error: any) {
    console.error('Error starting workflow:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        message: 'Error starting workflow',
        error: error?.message,
      }),
    };
  }
};

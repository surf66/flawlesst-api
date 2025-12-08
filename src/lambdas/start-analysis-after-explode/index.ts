import { SFNClient, StartExecutionCommand } from '@aws-sdk/client-sfn';

const sfn = new SFNClient({});

interface ExplodeOutput {
  userId: string;
  projectId: string;
  filePaths: string[];
}

interface StepFunctionEvent {
  userId: string;
  projectId: string;
  autoStartAnalysis: boolean;
  analysisStateMachineArn?: string;
  explodeResult: {
    Payload: ExplodeOutput;
  };
}

export const handler = async (event: StepFunctionEvent) => {
  console.log('Explode completed, checking if analysis should be started');

  if (!event.autoStartAnalysis || !event.analysisStateMachineArn) {
    console.log('Auto-start analysis disabled or analysis state machine ARN not provided');
    return {
      status: 'skipped',
      message: 'Analysis not started automatically',
    };
  }

  try {
    const { userId, projectId } = event.explodeResult.Payload;

    const startExecutionCommand = new StartExecutionCommand({
      stateMachineArn: event.analysisStateMachineArn,
      name: `analysis-${projectId}-${Date.now()}`,
      input: JSON.stringify({
        userId,
        projectId,
        filePaths: event.explodeResult.Payload.filePaths,
      }),
    });

    const executionResponse = await sfn.send(startExecutionCommand);
    
    console.log(`Analysis started with execution ARN: ${executionResponse.executionArn}`);
    
    return {
      status: 'started',
      executionArn: executionResponse.executionArn,
      message: 'Analysis started successfully',
    };

  } catch (error) {
    console.error('Error starting analysis after explode:', error);
    throw error;
  }
};

import { SFNClient, StartExecutionCommand } from '@aws-sdk/client-sfn';
import { S3Client, ListObjectsV2Command } from '@aws-sdk/client-s3';

const sfn = new SFNClient({});
const s3 = new S3Client({});

const ANALYSIS_STATE_MACHINE_ARN = process.env.ANALYSIS_STATE_MACHINE_ARN!;
const SOURCE_BUCKET = process.env.SOURCE_BUCKET!;

interface AnalysisInput {
  userId: string;
  projectId: string;
}

export const handler = async (event: AnalysisInput) => {
  console.log(`Starting analysis for user ${event.userId}, project ${event.projectId}`);

  try {
    // List the exploded files for this project
    const prefix = `${event.userId}/${event.projectId}/exploded-repo/`;
    const listCommand = new ListObjectsV2Command({
      Bucket: SOURCE_BUCKET,
      Prefix: prefix,
    });

    const listResponse = await s3.send(listCommand);
    const files = listResponse.Contents?.filter(obj => obj.Key && !obj.Key.endsWith('/')) || [];
    
    if (files.length === 0) {
      throw new Error(`No exploded files found for project ${event.projectId}. Please run clone-repo first.`);
    }

    const filePaths = files.map(file => file.Key!.replace(prefix, ''));

    console.log(`Found ${filePaths.length} files to analyze`);

    // Start the analysis state machine
    const startExecutionCommand = new StartExecutionCommand({
      stateMachineArn: ANALYSIS_STATE_MACHINE_ARN,
      name: `analysis-${event.projectId}-${Date.now()}`,
      input: JSON.stringify({
        userId: event.userId,
        projectId: event.projectId,
        filePaths: filePaths,
      }),
    });

    const executionResponse = await sfn.send(startExecutionCommand);
    
    return {
      executionArn: executionResponse.executionArn,
      status: 'STARTED',
      message: `Analysis started for ${filePaths.length} files`,
      fileCount: filePaths.length,
    };

  } catch (error) {
    console.error('Error starting analysis:', error);
    throw error;
  }
};

import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';

const s3 = new S3Client({ region: process.env.AWS_REGION });
const bedrock = new BedrockRuntimeClient({ region: process.env.AWS_REGION });

const SOURCE_BUCKET = process.env.SOURCE_BUCKET!;
const RESULTS_BUCKET = process.env.RESULTS_BUCKET || SOURCE_BUCKET;

interface AnalysisInput {
  fileKey: string;
  fileName: string;
  userId: string;
  projectId: string;
  jobExecutionId: string;
}

interface AnalysisResult {
  file_name: string;
  automation_score: number;
  has_tests: boolean;
  test_type: 'unit' | 'integration' | 'e2e' | 'none';
  observations: string[];
  improvement_suggestions: string[];
}

const SYSTEM_PROMPT = `You are a Senior SDET (Software Development Engineer in Test). 
Analyze the code for 'Testability' and 'Automation Maturity'.
Return ONLY JSON format. No markdown, no conversational text.`;

const generateUserPrompt = (fileName: string, codeContent: string): string => {
  return `Analyze this code file:
${codeContent}

Output structure:
{
  "file_name": "${fileName}",
  "automation_score": <integer 0-10>,
  "has_tests": <boolean>,
  "test_type": <"unit" | "integration" | "e2e" | "none">,
  "observations": ["<string>", "<string>"],
  "improvement_suggestions": ["<string>", "<string>"]
}

Scoring Criteria:
- 10: Perfect coverage, mockable interfaces, CI-ready.
- 5: Some logic, but hard to test (tight coupling), no tests present.
- 0: Untestable spaghetti code, hardcoded secrets/paths.`;
};

const callBedrock = async (prompt: string): Promise<AnalysisResult> => {
  const command = new InvokeModelCommand({
    modelId: 'anthropic.claude-3-haiku-20240307-v1:0',
    contentType: 'application/json',
    accept: 'application/json',
    body: JSON.stringify({
      anthropic_version: 'bedrock-2023-05-31',
      max_tokens: 1000,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: prompt
        }
      ]
    })
  });

  const response = await bedrock.send(command);
  const responseBody = new TextDecoder().decode(response.body);
  const parsed = JSON.parse(responseBody);
  
  // Extract the content from Claude's response
  const content = parsed.content[0]?.text || '{}';
  
  try {
    return JSON.parse(content);
  } catch (error) {
    console.error('Failed to parse AI response as JSON:', content);
    throw new Error('Invalid JSON response from AI');
  }
};

export const handler = async (event: AnalysisInput): Promise<AnalysisResult> => {
  try {
    console.log(`Analyzing file: ${event.fileKey} for user ${event.userId}, project ${event.projectId}`);

    // Get the file content from S3
    const { Body: fileStream } = await s3.send(new GetObjectCommand({
      Bucket: SOURCE_BUCKET,
      Key: event.fileKey,
    }));

    if (!fileStream) {
      throw new Error(`Empty file stream received from S3 for key: ${event.fileKey}`);
    }

    // Read file content
    const chunks: Buffer[] = [];
    for await (const chunk of fileStream as AsyncIterable<Uint8Array>) {
      chunks.push(Buffer.from(chunk));
    }
    const codeContent = Buffer.concat(chunks).toString('utf-8');

    // Limit content size to avoid token limits
    const maxContentLength = 50000; // ~50k characters
    const truncatedContent = codeContent.length > maxContentLength 
      ? codeContent.substring(0, maxContentLength) + '\n... [Content truncated for analysis]'
      : codeContent;

    // Call AI for analysis
    const userPrompt = generateUserPrompt(event.fileName, truncatedContent);
    const analysisResult = await callBedrock(userPrompt);

    // Validate the result
    if (typeof analysisResult.automation_score !== 'number' || 
        analysisResult.automation_score < 0 || 
        analysisResult.automation_score > 10) {
      throw new Error('Invalid automation_score in AI response');
    }

    // Save the analysis result to S3
    const resultKey = `${event.userId}/${event.projectId}/analysis-results/${event.jobExecutionId}/${event.fileName}.json`;
    await s3.send(new PutObjectCommand({
      Bucket: RESULTS_BUCKET,
      Key: resultKey,
      Body: JSON.stringify(analysisResult, null, 2),
      ContentType: 'application/json',
    }));

    console.log(`Analysis completed for ${event.fileName}: score ${analysisResult.automation_score}`);
    
    return analysisResult;

  } catch (error) {
    console.error(`Error analyzing file ${event.fileKey}:`, error);
    
    // Return a default failed analysis result
    const failedResult: AnalysisResult = {
      file_name: event.fileName,
      automation_score: 0,
      has_tests: false,
      test_type: 'none',
      observations: [`Analysis failed: ${error instanceof Error ? error.message : 'Unknown error'}`],
      improvement_suggestions: ['Fix analysis errors and retry']
    };

    // Still save the failed result for tracking
    try {
      const resultKey = `${event.userId}/${event.projectId}/analysis-results/${event.jobExecutionId}/${event.fileName}.json`;
      await s3.send(new PutObjectCommand({
        Bucket: RESULTS_BUCKET,
        Key: resultKey,
        Body: JSON.stringify(failedResult, null, 2),
        ContentType: 'application/json',
      }));
    } catch (saveError) {
      console.error('Failed to save failed analysis result:', saveError);
    }

    return failedResult;
  }
};

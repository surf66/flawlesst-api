import { S3Client, GetObjectCommand, ListObjectsV2Command, PutObjectCommand } from '@aws-sdk/client-s3';
import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

const s3 = new S3Client({ region: process.env.AWS_REGION });
const bedrock = new BedrockRuntimeClient({ region: process.env.AWS_REGION });

const RESULTS_BUCKET = process.env.RESULTS_BUCKET!;
const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY!;

interface AggregatorInput {
  userId: string;
  projectId: string;
  jobExecutionId: string;
  filePaths: string[];
}

interface FileAnalysis {
  file_name: string;
  automation_score: number;
  has_tests: boolean;
  test_type: 'unit' | 'integration' | 'e2e' | 'none';
  observations: string[];
  improvement_suggestions: string[];
}

interface ProjectReport {
  id: string;
  project_id: string;
  overall_score: number;
  summary: string;
  total_files: number;
  files_with_tests: number;
  average_score: number;
  created_at: string;
}

interface FileAnalysisRecord {
  report_id: string;
  file_path: string;
  score: number;
  has_tests: boolean;
  test_type: string;
  suggestions: string[];
}

const generateSummaryPrompt = (observations: string[], scores: number[]): string => {
  const avgScore = scores.reduce((a, b) => a + b, 0) / scores.length;
  
  return `You are a Senior SDET providing an executive summary of code quality analysis.

Project Analysis Results:
- Total files analyzed: ${scores.length}
- Average automation score: ${avgScore.toFixed(1)}/10
- All observations from individual file analyses:
${observations.map(obs => `- ${obs}`).join('\n')}

Provide a concise executive summary (3-5 bullet points) focusing on:
1. Overall test automation maturity
2. Key strengths identified
3. Critical areas needing improvement
4. Recommended next steps

Return ONLY a JSON object with this structure:
{
  "summary": ["<bullet point 1>", "<bullet point 2>", "<bullet point 3>"]
}

Keep each bullet point under 100 characters and make them actionable for stakeholders.`;
};

const callBedrockForSummary = async (prompt: string): Promise<{ summary: string[] }> => {
  const command = new InvokeModelCommand({
    modelId: 'anthropic.claude-3-haiku-20240307-v1:0',
    contentType: 'application/json',
    accept: 'application/json',
    body: JSON.stringify({
      anthropic_version: 'bedrock-2023-05-31',
      max_tokens: 500,
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
  
  const content = parsed.content[0]?.text || '{"summary": ["Analysis completed"]}';
  
  try {
    return JSON.parse(content);
  } catch (error) {
    console.error('Failed to parse AI summary response:', content);
    return { summary: ['Analysis completed with mixed results'] };
  }
};

export const handler = async (event: AggregatorInput): Promise<ProjectReport> => {
  const supabase: SupabaseClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  
  try {
    console.log(`Aggregating results for user ${event.userId}, project ${event.projectId}, execution ${event.jobExecutionId}`);

    // List all analysis result files
    const resultsPrefix = `${event.userId}/${event.projectId}/analysis-results/${event.jobExecutionId}/`;
    const listCommand = new ListObjectsV2Command({
      Bucket: RESULTS_BUCKET,
      Prefix: resultsPrefix,
    });

    const listResponse = await s3.send(listCommand);
    const resultFiles = listResponse.Contents?.filter(obj => obj.Key?.endsWith('.json')) || [];

    if (resultFiles.length === 0) {
      throw new Error('No analysis results found to aggregate');
    }

    console.log(`Found ${resultFiles.length} analysis results to process`);

    // Read all analysis results
    const analyses: FileAnalysis[] = [];
    const allObservations: string[] = [];
    const allScores: number[] = [];

    for (const file of resultFiles) {
      if (!file.Key) continue;

      try {
        const { Body: fileStream } = await s3.send(new GetObjectCommand({
          Bucket: RESULTS_BUCKET,
          Key: file.Key,
        }));

        if (!fileStream) continue;

        const content = await new TextDecoder().decode(
          Buffer.from(await fileStream.transformToByteArray())
        );
        
        const analysis: FileAnalysis = JSON.parse(content);
        analyses.push(analysis);
        allObservations.push(...analysis.observations);
        allScores.push(analysis.automation_score);

      } catch (error) {
        console.error(`Error reading result file ${file.Key}:`, error);
        continue;
      }
    }

    if (analyses.length === 0) {
      throw new Error('Failed to read any valid analysis results');
    }

    // Calculate aggregate metrics
    const totalFiles = analyses.length;
    const filesWithTests = analyses.filter(a => a.has_tests).length;
    const averageScore = allScores.reduce((a, b) => a + b, 0) / allScores.length;
    const overallScore = Math.round(averageScore * 10); // Convert to 0-100 scale

    // Generate AI summary
    const summaryPrompt = generateSummaryPrompt(allObservations, allScores);
    const aiSummary = await callBedrockForSummary(summaryPrompt);
    const summaryText = aiSummary.summary.join('\n');

    // Create project report record
    const reportData = {
      project_id: event.projectId,
      overall_score: overallScore,
      summary: summaryText,
      total_files: totalFiles,
      files_with_tests: filesWithTests,
      average_score: Math.round(averageScore * 10) / 10, // Keep 1 decimal
    };

    const { data: report, error: reportError } = await supabase
      .from('project_reports')
      .insert(reportData)
      .select()
      .single();

    if (reportError || !report) {
      throw new Error(`Failed to create project report: ${reportError?.message || 'Unknown error'}`);
    }

    console.log(`Created project report with ID: ${report.id}`);

    // Create file analysis records (batch insert for efficiency)
    const fileRecords: FileAnalysisRecord[] = analyses.map(analysis => ({
      report_id: report.id,
      file_path: analysis.file_name,
      score: analysis.automation_score,
      has_tests: analysis.has_tests,
      test_type: analysis.test_type,
      suggestions: analysis.improvement_suggestions,
    }));

    // Insert in batches to avoid payload limits
    const batchSize = 50;
    for (let i = 0; i < fileRecords.length; i += batchSize) {
      const batch = fileRecords.slice(i, i + batchSize);
      const { error: batchError } = await supabase
        .from('file_analysis')
        .insert(batch);

      if (batchError) {
        console.error(`Error inserting batch ${i}-${i + batch.length}:`, batchError);
      }
    }

    console.log(`Inserted ${fileRecords.length} file analysis records`);

    // Save final aggregated report to S3 for backup
    const finalReport = {
      ...report,
      file_analyses: analyses,
      aggregation_summary: {
        total_files_processed: totalFiles,
        processing_date: new Date().toISOString(),
        job_execution_id: event.jobExecutionId,
      }
    };

    const reportKey = `${event.userId}/${event.projectId}/final-reports/${event.jobExecutionId}/master-report.json`;
    await s3.send(new PutObjectCommand({
      Bucket: RESULTS_BUCKET,
      Key: reportKey,
      Body: JSON.stringify(finalReport, null, 2),
      ContentType: 'application/json',
    }));

    console.log(`Aggregation completed successfully. Report ID: ${report.id}`);

    return report as ProjectReport;

  } catch (error) {
    console.error('Error in aggregate-results:', error);
    
    // Create a failure report if possible
    try {
      const failureReport = {
        project_id: event.projectId,
        overall_score: 0,
        summary: `Analysis failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        total_files: 0,
        files_with_tests: 0,
        average_score: 0,
      };

      const { data: report } = await supabase
        .from('project_reports')
        .insert(failureReport)
        .select()
        .single();

      if (report) {
        return report as ProjectReport;
      }
    } catch (fallbackError) {
      console.error('Failed to create failure report:', fallbackError);
    }

    throw error;
  }
};

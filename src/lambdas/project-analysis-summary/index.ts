import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { SingleProjectResponse, ErrorResponse } from './types';
import { createResponse, APIGatewayResponse } from './utils';

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY!;

export const handler = async (event: any): Promise<APIGatewayResponse> => {
  const supabase: SupabaseClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  try {
    console.log('Project analysis summary request received:', JSON.stringify(event, null, 2));

    // Extract userId from query parameters and projectId from path parameters
    const userId = event.queryStringParameters?.userId || event.pathParameters?.userId;
    const projectId = event.pathParameters?.projectId;

    if (!userId) {
      return createResponse(400, {
        error: 'Missing required parameter: userId',
        message: 'userId must be provided as a query parameter',
      });
    }

    if (!projectId) {
      return createResponse(400, {
        error: 'Missing required parameter: projectId',
        message: 'projectId must be provided as a path parameter',
      });
    }

    console.log(`Fetching project analysis summary for user: ${userId}, project: ${projectId}`);

    const query = supabase
      .from('project_analysis_summary')
      .select('*')
      .eq('user_id', userId)
      .eq('project_id', projectId)
      .order('analysis_date', { ascending: false })
      .limit(1); // Only get the most recent report

    const { data: summaries, error } = await query;

    if (error) {
      console.error('Database query error:', error);
      return createResponse(500, {
        error: 'Database query failed',
        message: error.message,
      });
    }

    if (!summaries || summaries.length === 0) {
      return createResponse(404, {
        error: 'Project analysis summary not found',
        message: `No analysis reports found for project ${projectId} and user ${userId}`,
      });
    }

    console.log(`Found project analysis summary for project ${projectId}`);

    // Return the single project summary
    const latestSummary = summaries[0]; // Already ordered by date desc and limited to 1
    const response: SingleProjectResponse = {
      project_summary: latestSummary,
      total_reports: 1,
    };
    return createResponse(200, response);

  } catch (error) {
    console.error('Unexpected error in project-analysis-summary:', error);
    const response: ErrorResponse = {
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error occurred',
    };
    return createResponse(500, response);
  }
};

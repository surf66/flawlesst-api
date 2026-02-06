import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { UserProjectsResponse, ErrorResponse } from './types';
import { createResponse, APIGatewayResponse } from './utils';

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY!;

export const handler = async (event: any): Promise<APIGatewayResponse> => {
  const supabase: SupabaseClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  try {
    console.log('Get user projects request received:', JSON.stringify(event, null, 2));

    // Extract userId from query parameters
    const userId = event.queryStringParameters?.userId;

    if (!userId) {
      return createResponse(400, {
        error: 'Missing required parameter: userId',
        message: 'userId must be provided as a query parameter',
      });
    }

    console.log(`Fetching projects for user: ${userId}`);

    const query = supabase
      .from('connected_repositories')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    const { data: projects, error } = await query;

    if (error) {
      console.error('Database query error:', error);
      return createResponse(500, {
        error: 'Database query failed',
        message: error.message,
      });
    }

    console.log(`Found ${projects?.length || 0} projects for user ${userId}`);

    // Return the user's projects
    const response: UserProjectsResponse = {
      projects: projects || [],
      total_projects: projects?.length || 0,
    };

    return createResponse(200, response);

  } catch (error) {
    console.error('Unexpected error in get-user-projects:', error);
    const response: ErrorResponse = {
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error occurred',
    };
    return createResponse(500, response);
  }
};

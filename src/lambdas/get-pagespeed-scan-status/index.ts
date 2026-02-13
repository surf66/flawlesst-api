import { createClient, SupabaseClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY!;

interface APIGatewayResponse {
  statusCode: number;
  headers: { [key: string]: string };
  body: string;
}

interface ScanStatusResponse {
  scan_id: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  message?: string;
  performance_score?: number;
  first_contentful_paint?: number;
  largest_contentful_paint?: number;
  first_input_delay?: number;
  cumulative_layout_shift?: number;
  seo_score?: number;
  accessibility_score?: number;
  best_practices_score?: number;
  scan_duration_ms?: number;
  error_message?: string;
  created_at: string;
  completed_at?: string;
}

class PageSpeedStatusChecker {
  private supabase: SupabaseClient;

  constructor() {
    if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
      throw new Error('Missing Supabase configuration');
    }
    this.supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  }

  async getScanStatus(scanId: string): Promise<ScanStatusResponse | null> {
    try {
      const { data, error } = await this.supabase
        .from('pagespeed_scans')
        .select('*')
        .eq('id', scanId)
        .single();

      if (error) {
        console.error('Failed to fetch scan status:', error);
        return null;
      }

      if (!data) {
        console.log(`No scan found with ID: ${scanId}`);
        return null;
      }

      return {
        scan_id: data.id,
        status: data.scan_status,
        message: this.getStatusMessage(data.scan_status),
        performance_score: data.performance_score,
        first_contentful_paint: data.first_contentful_paint,
        largest_contentful_paint: data.largest_contentful_paint,
        first_input_delay: data.first_input_delay,
        cumulative_layout_shift: data.cumulative_layout_shift,
        seo_score: data.seo_score,
        accessibility_score: data.accessibility_score,
        best_practices_score: data.best_practices_score,
        scan_duration_ms: data.scan_duration_ms,
        error_message: data.error_message,
        created_at: data.created_at,
        completed_at: data.completed_at
      };
    } catch (error) {
      console.error('Error fetching scan status:', error);
      return null;
    }
  }

  private getStatusMessage(status: string): string {
    switch (status) {
      case 'pending':
        return 'Scan is queued and will start shortly';
      case 'running':
        return 'Scan is in progress. This may take 1-2 minutes.';
      case 'completed':
        return 'Scan completed successfully';
      case 'failed':
        return 'Scan failed. Please check the error message.';
      default:
        return 'Unknown status';
    }
  }
}

export const handler = async (event: any): Promise<APIGatewayResponse> => {
  const checker = new PageSpeedStatusChecker();

  try {
    // Extract scan_id from path parameters or query string
    const scanId = event.pathParameters?.scanId || 
                   event.queryStringParameters?.scan_id;

    if (!scanId) {
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify({
          error: 'Missing scan_id parameter'
        })
      };
    }

    console.log(`Checking status for scan ID: ${scanId}`);

    const scanStatus = await checker.getScanStatus(scanId);

    if (!scanStatus) {
      return {
        statusCode: 404,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify({
          error: 'Scan not found'
        })
      };
    }

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify(scanStatus)
    };

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    console.error('PageSpeed scan status check failed:', errorMessage);

    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({
        error: `Failed to check scan status: ${errorMessage}`
      })
    };
  }
};

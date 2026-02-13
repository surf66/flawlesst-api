import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { SFNClient, StartExecutionCommand } from '@aws-sdk/client-sfn';
import { v4 as uuidv4 } from 'uuid';

const sfn = new SFNClient({ region: process.env.DEPLOYMENT_REGION });

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY!;
const PAGE_SPEED_STATE_MACHINE_ARN = process.env.PAGE_SPEED_STATE_MACHINE_ARN!;

interface PageSpeedScanInput {
  target_url?: string;
  customer_id?: string;
  mode?: 'individual' | 'scheduled';
  user_id?: string;
  strategy?: 'desktop' | 'mobile';
}

interface APIGatewayResponse {
  statusCode: number;
  headers: { [key: string]: string };
  body: string;
}

interface PageSpeedScanResponse {
  scan_id: string;
  status: string;
  message: string;
}

class PageSpeedScanTrigger {
  private supabase: SupabaseClient;

  constructor() {
    if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
      throw new Error('Missing Supabase configuration');
    }

    this.supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  }

  async createScanRecord(customerId: string, targetUrl: string, strategy: 'desktop' | 'mobile' = 'desktop'): Promise<string> {
    const scanId = uuidv4();

    const scanRecord: any = {
      id: scanId,
      customer_id: customerId,
      target_url: targetUrl,
      scan_status: 'pending',
      strategy: strategy,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    try {
      const { error } = await this.supabase
        .from('pagespeed_scans')
        .insert(scanRecord);

      if (error) {
        console.error('Failed to create PageSpeed scan record:', error);
        throw new Error(`Failed to create scan record: ${error.message}`);
      }

      console.log(`Created PageSpeed scan record with ID: ${scanId}`);
      return scanId;
    } catch (error) {
      console.error('Error creating PageSpeed scan record:', error);
      throw error;
    }
  }

  async startStepFunction(scanId: string, targetUrl: string, customerId: string, strategy: 'desktop' | 'mobile'): Promise<void> {
    const input = {
      scan_id: scanId,
      target_url: targetUrl,
      customer_id: customerId,
      strategy: strategy
    };

    const command = new StartExecutionCommand({
      stateMachineArn: PAGE_SPEED_STATE_MACHINE_ARN,
      name: `pagespeed-scan-${scanId}`,
      input: JSON.stringify(input)
    });

    try {
      const result = await sfn.send(command);
      console.log(`Started Step Function execution: ${result.executionArn}`);
    } catch (error) {
      console.error('Failed to start Step Function:', error);
      throw error;
    }
  }

  async validateUrl(url: string): Promise<boolean> {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  }

  async getUserAccessibilityUrls(userId?: string): Promise<Array<{ id: string, user_id: string, name: string, url: string }>> {
    try {
      let query = this.supabase
        .from('user_accessibility_urls')
        .select('id, user_id, name, url');

      if (userId) {
        query = query.eq('user_id', userId);
      }

      const { data, error } = await query;

      if (error) {
        console.error('Failed to fetch user accessibility URLs:', error);
        throw new Error(`Failed to fetch user accessibility URLs: ${error.message}`);
      }

      return data || [];
    } catch (error) {
      console.error('Error fetching user accessibility URLs:', error);
      throw error;
    }
  }
}

export const handler = async (event: any): Promise<APIGatewayResponse> => {
  const trigger = new PageSpeedScanTrigger();

  // Parse the request body from API Gateway
  let requestBody: PageSpeedScanInput;
  try {
    requestBody = event.body ? JSON.parse(event.body) : {};
  } catch (error) {
    console.error('Failed to parse request body:', error);
    return {
      statusCode: 400,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({
        scan_id: '',
        status: 'error',
        message: 'Invalid JSON in request body'
      })
    };
  }

  // Debug logging to see what's being received
  console.log('Received event body:', event.body);
  console.log('Parsed requestBody:', JSON.stringify(requestBody, null, 2));
  console.log('RequestBody keys:', Object.keys(requestBody));
  console.log('target_url:', requestBody.target_url);
  console.log('customer_id:', requestBody.customer_id);

  try {
    const mode = requestBody.mode || 'individual';
    const strategy = requestBody.strategy || 'desktop';

    if (mode === 'scheduled') {
      // Scheduled mode: start async scans for all URLs from user_accessibility_urls table
      console.log('Starting scheduled PageSpeed scans for all URLs');

      const userUrls = await trigger.getUserAccessibilityUrls();
      console.log(`Found ${userUrls.length} URLs to scan`);

      if (userUrls.length === 0) {
        return {
          statusCode: 200,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          },
          body: JSON.stringify({
            scans: []
          })
        };
      }

      const scanResults: PageSpeedScanResponse[] = [];

      // Start async scans for each URL
      for (const urlRecord of userUrls) {
        try {
          console.log(`Starting async scan for URL: ${urlRecord.url} (Name: ${urlRecord.name})`);

          // Validate URL format
          if (!await trigger.validateUrl(urlRecord.url)) {
            console.warn(`Skipping invalid URL: ${urlRecord.url}`);
            scanResults.push({
              scan_id: '',
              status: 'error',
              message: `Invalid URL format: ${urlRecord.url}`
            });
            continue;
          }

          // Create scan record
          const scanId = await trigger.createScanRecord(urlRecord.user_id, urlRecord.url, strategy);

          // Start Step Function for async processing
          await trigger.startStepFunction(scanId, urlRecord.url, urlRecord.user_id, strategy);

          scanResults.push({
            scan_id: scanId,
            status: 'pending',
            message: `PageSpeed scan started for ${urlRecord.name}`
          });

          console.log(`Successfully started scan for ${urlRecord.name}: ${scanId}`);

        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
          console.error(`Failed to start scan for ${urlRecord.url}:`, errorMessage);

          scanResults.push({
            scan_id: '',
            status: 'error',
            message: `Failed to start scan for ${urlRecord.name}: ${errorMessage}`
          });
        }
      }

      console.log(`Scheduled PageSpeed scan initiation completed. Started: ${scanResults.filter(r => r.status === 'pending').length}, Failed: ${scanResults.filter(r => r.status === 'error').length}`);

      return {
        statusCode: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify({
          scans: scanResults
        })
      };
    } else {
      // Individual mode: async "fire and forget" approach
      // Support both snake_case and camelCase field names for compatibility
      const target_url = requestBody.target_url || (requestBody as any).targetUrl;
      const customer_id = requestBody.customer_id || (requestBody as any).customerId;

      if (!target_url || !customer_id) {
        return {
          statusCode: 400,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          },
          body: JSON.stringify({
            scan_id: '',
            status: 'error',
            message: 'Missing required fields: target_url and customer_id'
          })
        };
      }

      // Validate URL format
      if (!await trigger.validateUrl(target_url)) {
        return {
          statusCode: 400,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          },
          body: JSON.stringify({
            scan_id: '',
            status: 'error',
            message: 'Invalid target_url format'
          })
        };
      }

      console.log(`Starting async PageSpeed scan for URL: ${target_url}`);
      console.log(`Customer ID: ${customer_id}`);
      console.log(`Strategy: ${strategy}`);

      // Create scan record
      const scanId = await trigger.createScanRecord(customer_id, target_url, strategy);

      // Start Step Function for async processing
      await trigger.startStepFunction(scanId, target_url, customer_id, strategy);

      return {
        statusCode: 202,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify({
          scan_id: scanId,
          status: 'pending',
          message: 'PageSpeed scan started. Check status using the scan ID.'
        })
      };
    }

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    console.error('PageSpeed scan trigger failed:', errorMessage);

    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({
        scan_id: '',
        status: 'error',
        message: `Failed to start PageSpeed scan: ${errorMessage}`
      })
    };
  }
};

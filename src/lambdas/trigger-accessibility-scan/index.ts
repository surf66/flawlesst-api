import { ECSClient, RunTaskCommand } from '@aws-sdk/client-ecs';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { v4 as uuidv4 } from 'uuid';
import { APIGatewayProxyEventV2 } from 'aws-lambda';

const ecs = new ECSClient({ region: process.env.DEPLOYMENT_REGION });

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY!;
const TASK_DEFINITION_ARN = process.env.TASK_DEFINITION_ARN!;
const CLUSTER_NAME = process.env.CLUSTER_NAME!;
const SUBNETS = process.env.SUBNETS!.split(',');
const SECURITY_GROUPS = process.env.SECURITY_GROUPS!.split(',');
const ASSIGN_PUBLIC_IP = process.env.ASSIGN_PUBLIC_IP === 'true';

interface AccessibilityScanInput {
  target_url?: string;
  customer_id?: string;
  mode?: 'individual' | 'scheduled';
  user_id?: string;
}

interface AccessibilityScanResponse {
  scan_id: string;
  status: string;
  message: string;
}

interface APIGatewayResponse {
  statusCode: number;
  headers: { [key: string]: string };
  body: string;
}

interface ScanRecord {
  id: string;
  customer_id: string;
  target_url: string;
  name?: string;
  scan_status: 'pending' | 'running' | 'completed' | 'failed';
  violations: any[];
  violation_count: number;
  scan_duration_ms?: number;
  error_message?: string;
  created_at: string;
  completed_at?: string;
}

class AccessibilityScanTrigger {
  private supabase: SupabaseClient;

  constructor() {
    if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
      throw new Error('Missing Supabase configuration');
    }

    this.supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  }

  public formatResponse(statusCode: number, data: any): APIGatewayResponse {
    return {
      statusCode,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
        'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS'
      },
      body: JSON.stringify(data)
    };
  }

  async createScanRecord(customerId: string, targetUrl: string, name?: string): Promise<string> {
    const scanId = uuidv4();

    const scanRecord: Partial<ScanRecord> = {
      id: scanId,
      customer_id: customerId,
      target_url: targetUrl,
      name: name || undefined,
      scan_status: 'pending',
      violations: [],
      violation_count: 0,
      created_at: new Date().toISOString()
    };

    try {
      const { error } = await this.supabase
        .from('accessibility_scans')
        .insert(scanRecord);

      if (error) {
        console.error('Failed to create scan record:', error);
        throw new Error(`Failed to create scan record: ${error.message}`);
      }

      console.log(`Created scan record with ID: ${scanId}`);
      return scanId;
    } catch (error) {
      console.error('Error creating scan record:', error);
      throw error;
    }
  }

  async triggerFargateTask(scanId: string, targetUrl: string, customerId: string, name?: string): Promise<void> {
    const containerOverrides = {
      name: 'accessibility-scanner',
      environment: [
        {
          name: 'TARGET_URL',
          value: targetUrl
        },
        {
          name: 'CUSTOMER_ID',
          value: customerId
        },
        {
          name: 'SCAN_ID',
          value: scanId
        },
        {
          name: 'SCAN_NAME',
          value: name || ''
        },
        {
          name: 'SUPABASE_URL',
          value: SUPABASE_URL
        },
        {
          name: 'SUPABASE_SERVICE_KEY',
          value: SUPABASE_SERVICE_KEY
        }
      ]
    };

    const runTaskCommand = new RunTaskCommand({
      cluster: CLUSTER_NAME,
      taskDefinition: TASK_DEFINITION_ARN,
      launchType: 'FARGATE',
      networkConfiguration: {
        awsvpcConfiguration: {
          subnets: SUBNETS,
          securityGroups: SECURITY_GROUPS,
          assignPublicIp: ASSIGN_PUBLIC_IP ? 'ENABLED' : 'DISABLED'
        }
      },
      overrides: {
        containerOverrides: [containerOverrides]
      },
      count: 1
    });

    try {
      console.log('Starting Fargate task...');
      const result = await ecs.send(runTaskCommand);

      if (!result.tasks || result.tasks.length === 0) {
        throw new Error('No tasks were started');
      }

      const task = result.tasks[0];
      console.log(`Fargate task started: ${task.taskArn}`);

      if (task.lastStatus === 'STOPPED' && task.stopCode) {
        throw new Error(`Task stopped immediately: ${task.stopCode} - ${task.stoppedReason}`);
      }

    } catch (error) {
      console.error('Failed to start Fargate task:', error);

      // Update scan record to failed status
      await this.updateScanStatus(scanId, 'failed', `Failed to start Fargate task: ${error instanceof Error ? error.message : 'Unknown error'}`);

      throw error;
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

  async updateScanStatus(scanId: string, status: 'pending' | 'running' | 'completed' | 'failed', errorMessage?: string): Promise<void> {
    const updateData: any = {
      scan_status: status,
      updated_at: new Date().toISOString()
    };

    if (status === 'completed') {
      updateData.completed_at = new Date().toISOString();
    }

    if (errorMessage) {
      updateData.error_message = errorMessage;
    }

    try {
      const { error } = await this.supabase
        .from('accessibility_scans')
        .update(updateData)
        .eq('id', scanId);

      if (error) {
        console.error('Failed to update scan status:', error);
      } else {
        console.log(`Updated scan ${scanId} status to: ${status}`);
      }
    } catch (error) {
      console.error('Error updating scan status:', error);
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
}

export const handler = async (event: APIGatewayProxyEventV2): Promise<APIGatewayResponse> => {
  // Parse the request body from API Gateway
  let requestBody: AccessibilityScanInput;
  try {
    if (!event.body) {
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
          'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS'
        },
        body: JSON.stringify({
          scan_id: '',
          status: 'error',
          message: 'Request body is required'
        })
      };
    }
    requestBody = JSON.parse(event.body);
  } catch (error) {
    return {
      statusCode: 400,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
        'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS'
      },
      body: JSON.stringify({
        scan_id: '',
        status: 'error',
        message: 'Invalid JSON in request body'
      })
    };
  }

  const trigger = new AccessibilityScanTrigger();

  try {
    const mode = requestBody.mode || 'individual';

    if (mode === 'scheduled') {
      // Scheduled mode: scan all URLs from user_accessibility_urls table
      console.log('Starting scheduled accessibility scans for all URLs');

      const userUrls = await trigger.getUserAccessibilityUrls();
      console.log(`Found ${userUrls.length} URLs to scan`);

      if (userUrls.length === 0) {
        return trigger.formatResponse(200, {
          scans: []
        });
      }

      const scanResults: AccessibilityScanResponse[] = [];

      // Process each URL
      for (const urlRecord of userUrls) {
        try {
          console.log(`Processing URL: ${urlRecord.url} (Name: ${urlRecord.name})`);

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
          const scanId = await trigger.createScanRecord(urlRecord.user_id, urlRecord.url, urlRecord.name);

          // Trigger Fargate task
          await trigger.triggerFargateTask(scanId, urlRecord.url, urlRecord.user_id, urlRecord.name);

          scanResults.push({
            scan_id: scanId,
            status: 'started',
            message: `Accessibility scan started for ${urlRecord.name}`
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

      console.log(`Scheduled scan execution completed. Started: ${scanResults.filter(r => r.status === 'started').length}, Failed: ${scanResults.filter(r => r.status === 'error').length}`);

      return trigger.formatResponse(200, {
        scans: scanResults
      });

    } else {
      // Individual mode: existing behavior for backward compatibility
      const { target_url, customer_id } = requestBody;

      if (!target_url || !customer_id) {
        return trigger.formatResponse(400, {
          scan_id: '',
          status: 'error',
          message: 'Missing required fields: target_url and customer_id'
        });
      }

      // Validate URL format
      if (!await trigger.validateUrl(target_url)) {
        return trigger.formatResponse(400, {
          scan_id: '',
          status: 'error',
          message: 'Invalid target_url format'
        });
      }

      console.log(`Starting accessibility scan for URL: ${target_url}`);
      console.log(`Customer ID: ${customer_id}`);

      // Create scan record
      const scanId = await trigger.createScanRecord(customer_id, target_url);

      // Trigger Fargate task
      await trigger.triggerFargateTask(scanId, target_url, customer_id);

      return trigger.formatResponse(202, {
        scan_id: scanId,
        status: 'started',
        message: 'Accessibility scan started successfully'
      });
    }

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    console.error('Accessibility scan trigger failed:', errorMessage);

    return trigger.formatResponse(500, {
      scan_id: '',
      status: 'error',
      message: `Failed to start accessibility scan: ${errorMessage}`
    });
  }
};

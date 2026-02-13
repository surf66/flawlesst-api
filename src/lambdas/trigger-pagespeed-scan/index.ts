import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { v4 as uuidv4 } from 'uuid';

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY!;
const GOOGLE_PAGESPEED_API_KEY = process.env.GOOGLE_PAGESPEED_API_KEY!;

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

interface PageSpeedScanRecord {
  id: string;
  customer_id: string;
  target_url: string;
  scan_status: 'pending' | 'running' | 'completed' | 'failed';
  performance_score?: number;
  first_contentful_paint?: number;
  largest_contentful_paint?: number;
  first_input_delay?: number;
  cumulative_layout_shift?: number;
  seo_score?: number;
  accessibility_score?: number;
  best_practices_score?: number;
  full_response: any;
  strategy: 'desktop' | 'mobile';
  error_message?: string;
  scan_duration_ms?: number;
  created_at: string;
  updated_at: string;
  completed_at?: string;
}

interface GooglePageSpeedResponse {
  lighthouseResult: {
    categories: {
      performance: { score: number };
      seo: { score: number };
      accessibility: { score: number };
      'best-practices': { score: number };
    };
    audits: {
      'first-contentful-paint': { numericValue: number };
      'largest-contentful-paint': { numericValue: number };
      'max-potential-fid': { numericValue: number };
      'cumulative-layout-shift': { numericValue: number };
    };
  };
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

    const scanRecord: Partial<PageSpeedScanRecord> = {
      id: scanId,
      customer_id: customerId,
      target_url: targetUrl,
      scan_status: 'pending',
      performance_score: undefined,
      first_contentful_paint: undefined,
      largest_contentful_paint: undefined,
      first_input_delay: undefined,
      cumulative_layout_shift: undefined,
      seo_score: undefined,
      accessibility_score: undefined,
      best_practices_score: undefined,
      full_response: {},
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

  async callPageSpeedAPI(url: string, strategy: 'desktop' | 'mobile' = 'desktop'): Promise<GooglePageSpeedResponse> {
    if (!GOOGLE_PAGESPEED_API_KEY) {
      throw new Error('Google PageSpeed API key is not configured');
    }

    const apiUrl = `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(url)}&strategy=${strategy}&key=${GOOGLE_PAGESPEED_API_KEY}`;

    console.log(`Calling PageSpeed API for URL: ${url} with strategy: ${strategy}`);

    try {
      const response = await fetch(apiUrl);

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`PageSpeed API error: ${response.status} ${response.statusText} - ${errorText}`);
      }

      const data = await response.json() as GooglePageSpeedResponse;
      console.log('PageSpeed API call successful');
      return data;
    } catch (error) {
      console.error('Failed to call PageSpeed API:', error);
      throw error;
    }
  }

  async extractMetrics(pageSpeedData: GooglePageSpeedResponse): Promise<{
    performance_score: number;
    first_contentful_paint: number;
    largest_contentful_paint: number;
    first_input_delay: number;
    cumulative_layout_shift: number;
    seo_score: number;
    accessibility_score: number;
    best_practices_score: number;
  }> {
    const { lighthouseResult } = pageSpeedData;

    return {
      performance_score: Math.round(lighthouseResult.categories.performance.score * 100),
      first_contentful_paint: Math.round(lighthouseResult.audits['first-contentful-paint'].numericValue),
      largest_contentful_paint: Math.round(lighthouseResult.audits['largest-contentful-paint'].numericValue),
      first_input_delay: Math.round(lighthouseResult.audits['max-potential-fid'].numericValue),
      cumulative_layout_shift: parseFloat(lighthouseResult.audits['cumulative-layout-shift'].numericValue.toFixed(3)),
      seo_score: Math.round(lighthouseResult.categories.seo.score * 100),
      accessibility_score: Math.round(lighthouseResult.categories.accessibility.score * 100),
      best_practices_score: Math.round(lighthouseResult.categories['best-practices'].score * 100)
    };
  }

  async updateScanRecord(scanId: string, metrics: any, fullResponse: GooglePageSpeedResponse, scanDuration: number): Promise<void> {
    const updateData: any = {
      scan_status: 'completed',
      performance_score: metrics.performance_score,
      first_contentful_paint: metrics.first_contentful_paint,
      largest_contentful_paint: metrics.largest_contentful_paint,
      first_input_delay: metrics.first_input_delay,
      cumulative_layout_shift: metrics.cumulative_layout_shift,
      seo_score: metrics.seo_score,
      accessibility_score: metrics.accessibility_score,
      best_practices_score: metrics.best_practices_score,
      full_response: fullResponse,
      scan_duration_ms: scanDuration,
      completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    try {
      const { error } = await this.supabase
        .from('pagespeed_scans')
        .update(updateData)
        .eq('id', scanId);

      if (error) {
        console.error('Failed to update PageSpeed scan record:', error);
        throw error;
      }

      console.log(`Updated PageSpeed scan ${scanId} with metrics`);
    } catch (error) {
      console.error('Error updating PageSpeed scan record:', error);
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
        .from('pagespeed_scans')
        .update(updateData)
        .eq('id', scanId);

      if (error) {
        console.error('Failed to update PageSpeed scan status:', error);
      } else {
        console.log(`Updated PageSpeed scan ${scanId} status to: ${status}`);
      }
    } catch (error) {
      console.error('Error updating PageSpeed scan status:', error);
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

  async validateUrl(url: string): Promise<boolean> {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  }

  async performPageSpeedScan(scanId: string, targetUrl: string, strategy: 'desktop' | 'mobile' = 'desktop'): Promise<void> {
    const startTime = Date.now();

    try {
      // Update status to running
      await this.updateScanStatus(scanId, 'running');

      // Call PageSpeed API
      const pageSpeedData = await this.callPageSpeedAPI(targetUrl, strategy);

      // Extract metrics
      const metrics = await this.extractMetrics(pageSpeedData);

      // Calculate scan duration
      const scanDuration = Date.now() - startTime;

      // Update scan record with results
      await this.updateScanRecord(scanId, metrics, pageSpeedData, scanDuration);

      console.log(`PageSpeed scan completed successfully for ${targetUrl}`);
      console.log(`Performance score: ${metrics.performance_score}, Strategy: ${strategy}`);

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      console.error('PageSpeed scan failed:', errorMessage);

      // Update scan record to failed status
      await this.updateScanStatus(scanId, 'failed', errorMessage);
      throw error;
    }
  }
}

export const handler = async (event: PageSpeedScanInput): Promise<APIGatewayResponse> => {
  const trigger = new PageSpeedScanTrigger();

  // Debug logging to see what's being received
  console.log('Received event:', JSON.stringify(event, null, 2));
  console.log('Event keys:', Object.keys(event));
  console.log('target_url:', event.target_url);
  console.log('customer_id:', event.customer_id);

  try {
    const mode = event.mode || 'individual';
    const strategy = event.strategy || 'desktop';

    if (mode === 'scheduled') {
      // Scheduled mode: scan all URLs from user_accessibility_urls table
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
          const scanId = await trigger.createScanRecord(urlRecord.user_id, urlRecord.url, strategy);

          // Perform PageSpeed scan
          await trigger.performPageSpeedScan(scanId, urlRecord.url, strategy);

          scanResults.push({
            scan_id: scanId,
            status: 'completed',
            message: `PageSpeed scan completed for ${urlRecord.name}`
          });

          console.log(`Successfully completed scan for ${urlRecord.name}: ${scanId}`);

        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
          console.error(`Failed to scan ${urlRecord.url}:`, errorMessage);

          scanResults.push({
            scan_id: '',
            status: 'error',
            message: `Failed to scan ${urlRecord.name}: ${errorMessage}`
          });
        }
      }

      console.log(`Scheduled PageSpeed scan execution completed. Completed: ${scanResults.filter(r => r.status === 'completed').length}, Failed: ${scanResults.filter(r => r.status === 'error').length}`);

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
      // Individual mode: existing behavior for backward compatibility
      // Support both snake_case and camelCase field names for compatibility
      const target_url = event.target_url || (event as any).targetUrl;
      const customer_id = event.customer_id || (event as any).customerId;

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

      console.log(`Starting PageSpeed scan for URL: ${target_url}`);
      console.log(`Customer ID: ${customer_id}`);
      console.log(`Strategy: ${strategy}`);

      // Create scan record
      const scanId = await trigger.createScanRecord(customer_id, target_url, strategy);

      // Perform PageSpeed scan
      await trigger.performPageSpeedScan(scanId, target_url, strategy);

      return {
        statusCode: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify({
          scan_id: scanId,
          status: 'completed',
          message: 'PageSpeed scan completed successfully'
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

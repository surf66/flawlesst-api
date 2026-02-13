import { createClient, SupabaseClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY!;
const GOOGLE_PAGESPEED_API_KEY = process.env.GOOGLE_PAGESPEED_API_KEY!;

interface PageSpeedScanInput {
  scan_id: string;
  target_url: string;
  customer_id: string;
  strategy: 'desktop' | 'mobile';
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

class PageSpeedProcessor {
  private supabase: SupabaseClient;

  constructor() {
    if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
      throw new Error('Missing Supabase configuration');
    }
    this.supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  }

  async callPageSpeedAPI(url: string, strategy: 'desktop' | 'mobile'): Promise<GooglePageSpeedResponse> {
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

    // Helper function to safely extract score with fallback
    const getScore = (category: any): number => {
      return category && category.score !== undefined ? Math.round(category.score * 100) : 0;
    };

    // Helper function to safely extract audit numeric value with fallback
    const getAuditValue = (audits: any, auditName: string): number => {
      const audit = audits && audits[auditName];
      return audit && audit.numericValue !== undefined ? Math.round(audit.numericValue) : 0;
    };

    // Helper function to safely extract audit numeric value as float with fallback
    const getAuditFloatValue = (audits: any, auditName: string): number => {
      const audit = audits && audits[auditName];
      return audit && audit.numericValue !== undefined ? parseFloat(audit.numericValue.toFixed(3)) : 0;
    };

    return {
      performance_score: getScore(lighthouseResult?.categories?.performance),
      first_contentful_paint: getAuditValue(lighthouseResult?.audits, 'first-contentful-paint'),
      largest_contentful_paint: getAuditValue(lighthouseResult?.audits, 'largest-contentful-paint'),
      first_input_delay: getAuditValue(lighthouseResult?.audits, 'max-potential-fid'),
      cumulative_layout_shift: getAuditFloatValue(lighthouseResult?.audits, 'cumulative-layout-shift'),
      seo_score: getScore(lighthouseResult?.categories?.seo),
      accessibility_score: getScore(lighthouseResult?.categories?.accessibility),
      best_practices_score: getScore(lighthouseResult?.categories?.['best-practices'])
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

  async processScan(scanId: string, targetUrl: string, customerId: string, strategy: 'desktop' | 'mobile'): Promise<void> {
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

export const handler = async (input: PageSpeedScanInput): Promise<void> => {
  const processor = new PageSpeedProcessor();

  try {
    console.log(`Starting PageSpeed scan processing for scan ID: ${input.scan_id}`);
    console.log(`Target URL: ${input.target_url}`);
    console.log(`Customer ID: ${input.customer_id}`);
    console.log(`Strategy: ${input.strategy}`);

    // Note: customerId is extracted from input for completeness but not used directly
    // as it's stored with the scan record and used for database operations
    await processor.processScan(input.scan_id, input.target_url, input.customer_id, input.strategy);

    console.log(`PageSpeed scan processing completed for scan ID: ${input.scan_id}`);

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    console.error('PageSpeed scan processing failed:', errorMessage);
    throw error;
  }
};

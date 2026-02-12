import { createClient, SupabaseClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY!;

interface GetPageSpeedResultsInput {
  customer_id: string;
  target_url?: string;
  days_back?: number;
  strategy?: 'desktop' | 'mobile';
}

interface PageSpeedResult {
  id: string;
  target_url: string;
  performance_score: number | null;
  first_contentful_paint: number | null;
  largest_contentful_paint: number | null;
  first_input_delay: number | null;
  cumulative_layout_shift: number | null;
  seo_score: number | null;
  accessibility_score: number | null;
  best_practices_score: number | null;
  strategy: 'desktop' | 'mobile';
  scan_status: string;
  created_at: string;
  completed_at: string | null;
  scan_duration_ms: number | null;
}

interface PageSpeedResultsResponse {
  results: PageSpeedResult[];
  total_count: number;
  message: string;
}

class PageSpeedResultsGetter {
  private supabase: SupabaseClient;

  constructor() {
    if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
      throw new Error('Missing Supabase configuration');
    }

    this.supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  }

  async getPageSpeedResults(
    customerId: string,
    targetUrl?: string,
    daysBack: number = 30,
    strategy?: 'desktop' | 'mobile'
  ): Promise<PageSpeedResult[]> {
    try {
      let query = this.supabase
        .from('pagespeed_scans')
        .select('*')
        .eq('customer_id', customerId)
        .eq('scan_status', 'completed')
        .gte('created_at', new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000).toISOString())
        .order('created_at', { ascending: false });

      if (targetUrl) {
        query = query.eq('target_url', targetUrl);
      }

      if (strategy) {
        query = query.eq('strategy', strategy);
      }

      const { data, error } = await query;

      if (error) {
        console.error('Failed to fetch PageSpeed results:', error);
        throw new Error(`Failed to fetch PageSpeed results: ${error.message}`);
      }

      return data || [];
    } catch (error) {
      console.error('Error fetching PageSpeed results:', error);
      throw error;
    }
  }

  async getLatestResult(customerId: string, targetUrl: string, strategy: 'desktop' | 'mobile' = 'desktop'): Promise<PageSpeedResult | null> {
    try {
      const { data, error } = await this.supabase
        .from('pagespeed_scans')
        .select('*')
        .eq('customer_id', customerId)
        .eq('target_url', targetUrl)
        .eq('strategy', strategy)
        .eq('scan_status', 'completed')
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (error && error.code !== 'PGRST116') { // PGRST116 is "not found"
        console.error('Failed to fetch latest PageSpeed result:', error);
        throw new Error(`Failed to fetch latest PageSpeed result: ${error.message}`);
      }

      return data;
    } catch (error) {
      console.error('Error fetching latest PageSpeed result:', error);
      throw error;
    }
  }

  async getResultsSummary(customerId: string, daysBack: number = 30): Promise<{
    total_scans: number;
    avg_performance_score: number;
    avg_fcp: number;
    avg_lcp: number;
    avg_fid: number;
    avg_cls: number;
    unique_urls: number;
  }> {
    try {
      const { data, error } = await this.supabase
        .from('pagespeed_scans')
        .select('performance_score, first_contentful_paint, largest_contentful_paint, first_input_delay, cumulative_layout_shift, target_url')
        .eq('customer_id', customerId)
        .eq('scan_status', 'completed')
        .gte('created_at', new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000).toISOString());

      if (error) {
        console.error('Failed to fetch PageSpeed summary:', error);
        throw new Error(`Failed to fetch PageSpeed summary: ${error.message}`);
      }

      const results = data || [];
      const uniqueUrls = new Set(results.map(r => r.target_url)).size;

      return {
        total_scans: results.length,
        avg_performance_score: results.length > 0 ? Math.round(results.reduce((sum, r) => sum + (r.performance_score || 0), 0) / results.length) : 0,
        avg_fcp: results.length > 0 ? Math.round(results.reduce((sum, r) => sum + (r.first_contentful_paint || 0), 0) / results.length) : 0,
        avg_lcp: results.length > 0 ? Math.round(results.reduce((sum, r) => sum + (r.largest_contentful_paint || 0), 0) / results.length) : 0,
        avg_fid: results.length > 0 ? Math.round(results.reduce((sum, r) => sum + (r.first_input_delay || 0), 0) / results.length) : 0,
        avg_cls: results.length > 0 ? parseFloat((results.reduce((sum, r) => sum + (r.cumulative_layout_shift || 0), 0) / results.length).toFixed(3)) : 0,
        unique_urls: uniqueUrls
      };
    } catch (error) {
      console.error('Error fetching PageSpeed summary:', error);
      throw error;
    }
  }
}

export const handler = async (event: GetPageSpeedResultsInput): Promise<PageSpeedResultsResponse> => {
  const getter = new PageSpeedResultsGetter();

  try {
    const { customer_id, target_url, days_back = 30, strategy } = event;

    if (!customer_id) {
      return {
        results: [],
        total_count: 0,
        message: 'Missing required field: customer_id'
      };
    }

    console.log(`Fetching PageSpeed results for customer: ${customer_id}`);
    console.log(`Target URL: ${target_url || 'all URLs'}`);
    console.log(`Days back: ${days_back}`);
    console.log(`Strategy: ${strategy || 'all strategies'}`);

    const results = await getter.getPageSpeedResults(customer_id, target_url, days_back, strategy);

    console.log(`Found ${results.length} PageSpeed results`);

    return {
      results: results,
      total_count: results.length,
      message: 'PageSpeed results retrieved successfully'
    };

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    console.error('Get PageSpeed results failed:', errorMessage);

    return {
      results: [],
      total_count: 0,
      message: `Failed to retrieve PageSpeed results: ${errorMessage}`
    };
  }
};

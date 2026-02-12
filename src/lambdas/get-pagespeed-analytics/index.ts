import { createClient, SupabaseClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY!;

interface GetPageSpeedAnalyticsInput {
  customer_id: string;
  target_url?: string;
  days_back?: number;
  strategy?: 'desktop' | 'mobile';
}

interface TrendData {
  date: string;
  performance_score: number;
  first_contentful_paint: number;
  largest_contentful_paint: number;
  first_input_delay: number;
  cumulative_layout_shift: number;
}

interface AnalyticsData {
  target_url: string;
  strategy: 'desktop' | 'mobile';
  current_score: number;
  previous_score: number;
  score_change: number;
  trend: 'improving' | 'declining' | 'stable';
  trend_data: TrendData[];
  stats: {
    avg_score: number;
    min_score: number;
    max_score: number;
    total_scans: number;
    scan_frequency: number; // scans per week
  };
}

interface PageSpeedAnalyticsResponse {
  analytics: AnalyticsData[];
  overall_summary: {
    total_urls: number;
    overall_avg_score: number;
    total_scans: number;
    improvement_rate: number; // percentage of URLs with improving trend
  };
  message: string;
}

class PageSpeedAnalyticsGetter {
  private supabase: SupabaseClient;

  constructor() {
    if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
      throw new Error('Missing Supabase configuration');
    }

    this.supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  }

  async getTrendData(
    customerId: string,
    targetUrl: string,
    strategy: 'desktop' | 'mobile',
    daysBack: number = 30
  ): Promise<TrendData[]> {
    try {
      const { data, error } = await this.supabase
        .from('pagespeed_scans')
        .select('performance_score, first_contentful_paint, largest_contentful_paint, first_input_delay, cumulative_layout_shift, created_at')
        .eq('customer_id', customerId)
        .eq('target_url', targetUrl)
        .eq('strategy', strategy)
        .eq('scan_status', 'completed')
        .gte('created_at', new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000).toISOString())
        .order('created_at', { ascending: true });

      if (error) {
        console.error('Failed to fetch trend data:', error);
        throw new Error(`Failed to fetch trend data: ${error.message}`);
      }

      return (data || []).map(item => ({
        date: new Date(item.created_at).toISOString().split('T')[0],
        performance_score: item.performance_score || 0,
        first_contentful_paint: item.first_contentful_paint || 0,
        largest_contentful_paint: item.largest_contentful_paint || 0,
        first_input_delay: item.first_input_delay || 0,
        cumulative_layout_shift: item.cumulative_layout_shift || 0
      }));
    } catch (error) {
      console.error('Error fetching trend data:', error);
      throw error;
    }
  }

  async getLatestAndPreviousScores(
    customerId: string,
    targetUrl: string,
    strategy: 'desktop' | 'mobile'
  ): Promise<{ current: number; previous: number }> {
    try {
      const { data, error } = await this.supabase
        .from('pagespeed_scans')
        .select('performance_score, created_at')
        .eq('customer_id', customerId)
        .eq('target_url', targetUrl)
        .eq('strategy', strategy)
        .eq('scan_status', 'completed')
        .order('created_at', { ascending: false })
        .limit(2);

      if (error) {
        console.error('Failed to fetch latest scores:', error);
        throw new Error(`Failed to fetch latest scores: ${error.message}`);
      }

      const results = data || [];
      const current = results.length > 0 ? (results[0].performance_score || 0) : 0;
      const previous = results.length > 1 ? (results[1].performance_score || 0) : current;

      return { current, previous };
    } catch (error) {
      console.error('Error fetching latest scores:', error);
      throw error;
    }
  }

  calculateTrend(current: number, previous: number): 'improving' | 'declining' | 'stable' {
    const threshold = 5; // 5 point threshold for considering it a change
    if (current > previous + threshold) return 'improving';
    if (current < previous - threshold) return 'declining';
    return 'stable';
  }

  async getUrlStats(
    customerId: string,
    targetUrl: string,
    strategy: 'desktop' | 'mobile',
    daysBack: number = 30
  ): Promise<{
    avg_score: number;
    min_score: number;
    max_score: number;
    total_scans: number;
    scan_frequency: number;
  }> {
    try {
      const { data, error } = await this.supabase
        .from('pagespeed_scans')
        .select('performance_score, created_at')
        .eq('customer_id', customerId)
        .eq('target_url', targetUrl)
        .eq('strategy', strategy)
        .eq('scan_status', 'completed')
        .gte('created_at', new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000).toISOString());

      if (error) {
        console.error('Failed to fetch URL stats:', error);
        throw new Error(`Failed to fetch URL stats: ${error.message}`);
      }

      const results = data || [];
      const scores = results.map(r => r.performance_score || 0).filter(s => s > 0);

      if (scores.length === 0) {
        return {
          avg_score: 0,
          min_score: 0,
          max_score: 0,
          total_scans: 0,
          scan_frequency: 0
        };
      }

      const avg_score = Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length);
      const min_score = Math.min(...scores);
      const max_score = Math.max(...scores);

      // Calculate scan frequency (scans per week)
      const weeks = daysBack / 7;
      const scan_frequency = Math.round((results.length / weeks) * 10) / 10;

      return {
        avg_score,
        min_score,
        max_score,
        total_scans: results.length,
        scan_frequency
      };
    } catch (error) {
      console.error('Error fetching URL stats:', error);
      throw error;
    }
  }

  async getCustomerUrls(customerId: string): Promise<string[]> {
    try {
      const { data, error } = await this.supabase
        .from('pagespeed_scans')
        .select('target_url')
        .eq('customer_id', customerId)
        .eq('scan_status', 'completed');

      if (error) {
        console.error('Failed to fetch customer URLs:', error);
        throw new Error(`Failed to fetch customer URLs: ${error.message}`);
      }

      const urls = [...new Set((data || []).map(item => item.target_url))];
      return urls;
    } catch (error) {
      console.error('Error fetching customer URLs:', error);
      throw error;
    }
  }
}

export const handler = async (event: GetPageSpeedAnalyticsInput): Promise<PageSpeedAnalyticsResponse> => {
  const getter = new PageSpeedAnalyticsGetter();

  try {
    const { customer_id, target_url, days_back = 30, strategy = 'desktop' } = event;

    if (!customer_id) {
      return {
        analytics: [],
        overall_summary: {
          total_urls: 0,
          overall_avg_score: 0,
          total_scans: 0,
          improvement_rate: 0
        },
        message: 'Missing required field: customer_id'
      };
    }

    console.log(`Fetching PageSpeed analytics for customer: ${customer_id}`);
    console.log(`Target URL: ${target_url || 'all URLs'}`);
    console.log(`Days back: ${days_back}`);
    console.log(`Strategy: ${strategy}`);

    // Get URLs to analyze
    const urls = target_url ? [target_url] : await getter.getCustomerUrls(customer_id);

    if (urls.length === 0) {
      return {
        analytics: [],
        overall_summary: {
          total_urls: 0,
          overall_avg_score: 0,
          total_scans: 0,
          improvement_rate: 0
        },
        message: 'No URLs found for this customer'
      };
    }

    const analytics: AnalyticsData[] = [];
    let totalScans = 0;
    let allScores: number[] = [];
    let improvingCount = 0;

    // Process each URL
    for (const url of urls) {
      try {
        console.log(`Processing analytics for URL: ${url}`);

        // Get trend data
        const trendData = await getter.getTrendData(customer_id, url, strategy, days_back);

        // Get latest and previous scores
        const { current, previous } = await getter.getLatestAndPreviousScores(customer_id, url, strategy);

        // Calculate trend
        const trend = getter.calculateTrend(current, previous);

        // Get stats
        const stats = await getter.getUrlStats(customer_id, url, strategy, days_back);

        const analyticsData: AnalyticsData = {
          target_url: url,
          strategy: strategy,
          current_score: current,
          previous_score: previous,
          score_change: current - previous,
          trend: trend,
          trend_data: trendData,
          stats: stats
        };

        analytics.push(analyticsData);

        // Accumulate for overall summary
        totalScans += stats.total_scans;
        if (current > 0) allScores.push(current);
        if (trend === 'improving') improvingCount++;

      } catch (error) {
        console.error(`Failed to process analytics for ${url}:`, error);
        // Continue with next URL
      }
    }

    // Calculate overall summary
    const overallSummary = {
      total_urls: urls.length,
      overall_avg_score: allScores.length > 0 ? Math.round(allScores.reduce((sum, score) => sum + score, 0) / allScores.length) : 0,
      total_scans: totalScans,
      improvement_rate: urls.length > 0 ? Math.round((improvingCount / urls.length) * 100) : 0
    };

    console.log(`Analytics processing completed. URLs: ${urls.length}, Total scans: ${totalScans}`);

    return {
      analytics: analytics,
      overall_summary: overallSummary,
      message: 'PageSpeed analytics retrieved successfully'
    };

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    console.error('Get PageSpeed analytics failed:', errorMessage);

    return {
      analytics: [],
      overall_summary: {
        total_urls: 0,
        overall_avg_score: 0,
        total_scans: 0,
        improvement_rate: 0
      },
      message: `Failed to retrieve PageSpeed analytics: ${errorMessage}`
    };
  }
};

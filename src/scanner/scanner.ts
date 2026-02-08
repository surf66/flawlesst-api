import { chromium, Browser, Page } from 'playwright';
import { injectAxe, getViolations } from 'axe-playwright';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Environment variables
const TARGET_URL = process.env.TARGET_URL;
const CUSTOMER_ID = process.env.CUSTOMER_ID;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const SCAN_ID = process.env.SCAN_ID;

interface AccessibilityViolation {
  id: string;
  impact: 'minor' | 'moderate' | 'serious' | 'critical';
  tags: string[];
  description: string;
  help: string;
  helpUrl: string;
  nodes: Array<{
    html: string;
    target: string[];
    failureSummary: string;
  }>;
}

interface ScanResult {
  scanId: string;
  customerId: string;
  targetUrl: string;
  status: 'completed' | 'failed';
  violations: AccessibilityViolation[];
  violationCount: number;
  scanDurationMs: number;
  errorMessage?: string;
}

class AccessibilityScanner {
  private supabase: SupabaseClient;
  private browser: Browser | null = null;

  constructor() {
    if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
      throw new Error('Missing Supabase configuration');
    }

    this.supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  }

  async initialize(): Promise<void> {
    console.log('Initializing browser...');
    this.browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
  }

  async updateScanStatus(status: 'running' | 'completed' | 'failed', errorMessage?: string): Promise<void> {
    if (!SCAN_ID) {
      console.warn('No SCAN_ID provided, skipping status update');
      return;
    }

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
        .eq('id', SCAN_ID);

      if (error) {
        console.error('Failed to update scan status:', error);
      } else {
        console.log(`Updated scan status to: ${status}`);
      }
    } catch (error) {
      console.error('Error updating scan status:', error);
    }
  }

  async scanWebsite(url: string): Promise<ScanResult> {
    if (!this.browser) {
      throw new Error('Browser not initialized');
    }

    const startTime = Date.now();
    let page: Page | null = null;

    try {
      console.log(`Starting accessibility scan for: ${url}`);

      // Create new page
      page = await this.browser.newPage();

      // Set viewport and user agent
      await page.setViewportSize({ width: 1280, height: 720 });
      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');

      // Navigate to the target URL
      console.log('Navigating to target URL...');
      await page.goto(url, {
        waitUntil: 'networkidle',
        timeout: 30000
      });

      // Wait a bit for any dynamic content to load
      await page.waitForTimeout(2000);

      // Inject axe-core
      console.log('Injecting axe-core...');
      await injectAxe(page);

      // Run accessibility scan
      console.log('Running accessibility violations check...');
      const violations = await getViolations(page);

      const scanDuration = Date.now() - startTime;
      const violationCount = violations.length;

      console.log(`Scan completed in ${scanDuration}ms`);
      console.log(`Found ${violationCount} accessibility violations`);

      // Log violations for debugging
      if (violationCount > 0) {
        console.log('Violations summary:');
        violations.forEach((violation: any, index: number) => {
          console.log(`${index + 1}. ${violation.id} (${violation.impact}): ${violation.description}`);
        });
      }

      return {
        scanId: SCAN_ID || '',
        customerId: CUSTOMER_ID || '',
        targetUrl: url,
        status: 'completed',
        violations: violations as AccessibilityViolation[],
        violationCount,
        scanDurationMs: scanDuration
      };

    } catch (error) {
      const scanDuration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';

      console.error('Scan failed:', errorMessage);

      return {
        scanId: SCAN_ID || '',
        customerId: CUSTOMER_ID || '',
        targetUrl: url,
        status: 'failed',
        violations: [],
        violationCount: 0,
        scanDurationMs: scanDuration,
        errorMessage
      };
    } finally {
      if (page) {
        await page.close();
      }
    }
  }

  async saveResults(result: ScanResult): Promise<void> {
    if (!SCAN_ID) {
      console.warn('No SCAN_ID provided, skipping result save');
      return;
    }

    try {
      const updateData: any = {
        scan_status: result.status,
        violations: result.violations,
        violation_count: result.violationCount,
        scan_duration_ms: result.scanDurationMs,
        completed_at: new Date().toISOString()
      };

      if (result.errorMessage) {
        updateData.error_message = result.errorMessage;
      }

      const { error } = await this.supabase
        .from('accessibility_scans')
        .update(updateData)
        .eq('id', SCAN_ID);

      if (error) {
        console.error('Failed to save scan results:', error);
        throw error;
      }

      console.log('Scan results saved successfully');
    } catch (error) {
      console.error('Error saving scan results:', error);
      throw error;
    }
  }

  async cleanup(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }
}

async function main(): Promise<void> {
  const scanner = new AccessibilityScanner();

  try {
    // Validate required environment variables
    if (!TARGET_URL) {
      throw new Error('TARGET_URL environment variable is required');
    }
    if (!CUSTOMER_ID) {
      throw new Error('CUSTOMER_ID environment variable is required');
    }

    console.log(`Starting accessibility scan for URL: ${TARGET_URL}`);
    console.log(`Customer ID: ${CUSTOMER_ID}`);
    if (SCAN_ID) {
      console.log(`Scan ID: ${SCAN_ID}`);
    }

    // Initialize scanner
    await scanner.initialize();

    // Update status to running
    await scanner.updateScanStatus('running');

    // Perform the scan
    const result = await scanner.scanWebsite(TARGET_URL);

    // Save results
    await scanner.saveResults(result);

    // Update final status
    await scanner.updateScanStatus(result.status, result.errorMessage);

    // Log final results
    console.log('\n=== SCAN SUMMARY ===');
    console.log(`Status: ${result.status}`);
    console.log(`Duration: ${result.scanDurationMs}ms`);
    console.log(`Violations: ${result.violationCount}`);

    if (result.errorMessage) {
      console.log(`Error: ${result.errorMessage}`);
    }

    // Output violations as JSON for logging
    console.log('\n=== VIOLATIONS JSON ===');
    console.log(JSON.stringify(result.violations, null, 2));

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    console.error('Scanner failed:', errorMessage);

    // Update status to failed
    await scanner.updateScanStatus('failed', errorMessage);

    process.exit(1);
  } finally {
    await scanner.cleanup();
  }
}

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Run the scanner
if (require.main === module) {
  main().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

export { AccessibilityScanner, ScanResult, AccessibilityViolation };

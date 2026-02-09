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
  screenshotUrl?: string;
  errorMessage?: string;
}

class AccessibilityScanner {
  private supabase: SupabaseClient;
  private browser: Browser | null = null;

  constructor() {
    if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
      throw new Error('Missing Supabase configuration');
    }

    console.log('Initializing Supabase client...');
    console.log('SUPABASE_URL:', SUPABASE_URL);
    console.log('SUPABASE_SERVICE_KEY length:', SUPABASE_SERVICE_KEY.length);
    console.log('SUPABASE_SERVICE_KEY starts with:', SUPABASE_SERVICE_KEY.substring(0, 20) + '...');

    this.supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
      auth: {
        persistSession: false,
        autoRefreshToken: false
      }
    });

    console.log('Supabase client initialized');
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
      console.log(`Updating scan status to: ${status} for scan ID: ${SCAN_ID}`);

      const { data, error } = await this.supabase
        .from('accessibility_scans')
        .update(updateData)
        .eq('id', SCAN_ID)
        .select();

      if (error) {
        console.error('Failed to update scan status:', error);
        console.error('Error details:', JSON.stringify(error, null, 2));
        throw error;
      } else {
        console.log(`Updated scan status to: ${status}`);
        console.log('Updated record:', data);
      }
    } catch (error) {
      console.error('Error updating scan status:', error);
      throw error;
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
      await page.setExtraHTTPHeaders({
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      });

      // Navigate to the target URL
      console.log('Navigating to target URL...');
      await page.goto(url, {
        waitUntil: 'networkidle',
        timeout: 30000
      });

      // Wait a bit for any dynamic content to load
      await page.waitForTimeout(2000);

      // Take screenshot before running accessibility scan
      console.log('Taking screenshot...');
      const screenshot = await page.screenshot({
        type: 'png',
        fullPage: false,
        clip: { x: 0, y: 0, width: 1280, height: 720 }
      });

      // Upload screenshot to Supabase storage
      const screenshotUrl = await this.uploadScreenshot(screenshot, SCAN_ID || '');
      console.log('Screenshot uploaded to:', screenshotUrl);

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
        scanDurationMs: scanDuration,
        screenshotUrl
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

  async uploadScreenshot(screenshot: Buffer, scanId: string): Promise<string> {
    try {
      const fileName = `accessibility-screenshots/${scanId}.png`;

      const { data, error } = await this.supabase.storage
        .from('screenshots')
        .upload(fileName, screenshot, {
          contentType: 'image/png',
          upsert: true
        });

      if (error) {
        console.error('Failed to upload screenshot:', error);
        throw error;
      }

      // Get public URL
      const { data: { publicUrl } } = this.supabase.storage
        .from('screenshots')
        .getPublicUrl(fileName);

      return publicUrl;
    } catch (error) {
      console.error('Error uploading screenshot:', error);
      throw error;
    }
  }

  async saveResults(result: ScanResult): Promise<void> {
    if (!SCAN_ID) {
      console.warn('No SCAN_ID provided, skipping result save');
      return;
    }

    try {
      // Debug: Test if we can read the record first
      console.log('Testing Supabase connection and permissions...');
      const { data: testData, error: testError } = await this.supabase
        .from('accessibility_scans')
        .select('*')
        .eq('id', SCAN_ID);

      if (testError) {
        console.error('Cannot read record:', testError);
      } else {
        console.log('Query result count:', testData.length);
        if (testData.length > 0) {
          console.log('Successfully read record:', testData[0].id, testData[0].scan_status);
        } else {
          console.log('No records found with ID:', SCAN_ID);
        }
      }

      const updateData: any = {
        scan_status: result.status,
        violations: result.violations,
        violation_count: result.violationCount,
        scan_duration_ms: result.scanDurationMs,
        completed_at: new Date().toISOString()
      };

      if (result.screenshotUrl) {
        updateData.screenshot_url = result.screenshotUrl;
      }

      if (result.errorMessage) {
        updateData.error_message = result.errorMessage;
      }

      console.log('Saving scan results with data:', {
        scan_id: SCAN_ID,
        status: result.status,
        violation_count: result.violationCount,
        duration_ms: result.scanDurationMs
      });

      const { data, error } = await this.supabase
        .from('accessibility_scans')
        .update(updateData)
        .eq('id', SCAN_ID)
        .select();

      if (error) {
        console.error('Failed to save scan results:', error);
        console.error('Error details:', JSON.stringify(error, null, 2));
        throw error;
      }

      console.log('Scan results saved successfully');
      console.log('Updated record:', data);

      // Verify the update actually worked by reading it back
      const { data: verifyData, error: verifyError } = await this.supabase
        .from('accessibility_scans')
        .select('scan_status, violation_count, updated_at')
        .eq('id', SCAN_ID);

      if (verifyError) {
        console.error('Could not verify update:', verifyError);
      } else if (verifyData.length > 0) {
        console.log('Verification - current status in DB:', verifyData[0]);
      } else {
        console.log('Verification - no records found');
      }
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

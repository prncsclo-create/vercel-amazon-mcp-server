import puppeteer, { type Browser, type Page } from 'puppeteer-core';
import chromium from '@sparticuz/chromium';
import { captureAmazonSession, restoreAmazonSession } from './session-manager';
import type { OperationResult } from './types';

const AMAZON_DOMAIN = process.env.AMAZON_DOMAIN || 'amazon.com';
const AMAZON_BASE_URL = `https://www.${AMAZON_DOMAIN}`;

function isServerless(): boolean {
  return Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.AWS_REGION);
}

async function launchBrowser(): Promise<Browser> {
  const serverless = isServerless();
  const executablePath = process.env.CHROME_EXECUTABLE_PATH || (serverless ? await chromium.executablePath() : undefined);
  const args = serverless
    ? [...chromium.args, '--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--single-process', '--no-zygote']
    : ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'];

  return await puppeteer.launch({
    args,
    executablePath,
    headless: true,
    defaultViewport: { width: 1280, height: 800 },
  });
}

export async function withAmazonPage<T extends OperationResult>(
  sessionToken: string | undefined,
  task: (page: Page) => Promise<T>,
): Promise<T> {
  const browser = await launchBrowser();

  try {
    const page = await browser.newPage();
    await page.setDefaultTimeout(30000);

    if (sessionToken) {
      await restoreAmazonSession(page, sessionToken);
    }

    const result = await task(page);
    const updatedToken = await captureAmazonSession(page);

    return {
      ...result,
      sessionToken: updatedToken ?? sessionToken,
    } as T;
  } finally {
    await browser.close().catch(() => undefined);
  }
}

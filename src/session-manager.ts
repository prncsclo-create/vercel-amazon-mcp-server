import crypto from 'crypto';
import type { Page } from 'puppeteer-core';

const AMAZON_DOMAIN = process.env.AMAZON_DOMAIN || 'amazon.com';
const AMAZON_BASE_URL = `https://www.${AMAZON_DOMAIN}`;
const SESSION_SECRET = process.env.SESSION_SECRET || process.env.AUTH_TOKEN || 'amazon-mcp-server-session';

type Cookie = Awaited<ReturnType<Page['cookies']>>[number];

interface SessionPayload {
  version: 1;
  savedAt: string;
  cookies: Cookie[];
}

function base64UrlEncode(value: Buffer | string): string {
  return Buffer.from(value).toString('base64url');
}

function base64UrlDecode(value: string): Buffer {
  return Buffer.from(value, 'base64url');
}

function signPayload(payload: string): string {
  return crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest('base64url');
}

function isCookieArray(value: unknown): value is Cookie[] {
  return Array.isArray(value) && value.every((cookie) => cookie && typeof cookie === 'object' && 'domain' in cookie && 'name' in cookie && 'value' in cookie);
}

export function createSessionToken(cookies: Cookie[]): string | undefined {
  const amazonCookies = cookies.filter((cookie) => cookie.domain?.includes('amazon'));

  if (amazonCookies.length === 0) {
    return undefined;
  }

  const payload: SessionPayload = {
    version: 1,
    savedAt: new Date().toISOString(),
    cookies: amazonCookies.map((cookie) => ({
      ...cookie,
      expires: cookie.expires && cookie.expires > 0 ? cookie.expires : Math.floor(Date.now() / 1000) + 365 * 24 * 60 * 60,
    })),
  };

  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signature = signPayload(encodedPayload);
  return `v1.${encodedPayload}.${signature}`;
}

export function parseSessionToken(token?: string): Cookie[] | null {
  if (!token) {
    return null;
  }

  const [version, encodedPayload, signature] = token.split('.');
  if (version !== 'v1' || !encodedPayload || !signature) {
    return null;
  }

  const expectedSignature = signPayload(encodedPayload);
  const expectedBuffer = Buffer.from(expectedSignature);
  const actualBuffer = Buffer.from(signature);

  if (expectedBuffer.length !== actualBuffer.length || !crypto.timingSafeEqual(expectedBuffer, actualBuffer)) {
    return null;
  }

  try {
    const payload = JSON.parse(base64UrlDecode(encodedPayload).toString('utf8')) as Partial<SessionPayload>;
    if (payload.version !== 1 || !isCookieArray(payload.cookies)) {
      return null;
    }

    const now = Math.floor(Date.now() / 1000);
    return payload.cookies.filter((cookie) => !cookie.expires || cookie.expires > now);
  } catch {
    return null;
  }
}

export async function restoreAmazonSession(page: Page, token?: string): Promise<boolean> {
  const cookies = parseSessionToken(token);
  if (!cookies || cookies.length === 0) {
    return false;
  }

  await page.goto(AMAZON_BASE_URL, { waitUntil: 'domcontentloaded' });
  await page.setCookie(...cookies);
  return true;
}

export async function captureAmazonSession(page: Page): Promise<string | undefined> {
  const cookies = await page.cookies();
  return createSessionToken(cookies);
}

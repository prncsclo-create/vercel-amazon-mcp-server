import type { IncomingMessage, ServerResponse } from 'http';
import { handleMcpRequest } from '../src/server';

const AUTH_TOKEN = process.env.AUTH_TOKEN;

function isAuthorized(req: IncomingMessage): boolean {
  if (!AUTH_TOKEN) {
    return true;
  }

  const headerToken = req.headers.authorization?.replace(/^Bearer\s+/i, '');
  const queryToken = typeof req.url === 'string' ? new URL(req.url, 'http://localhost').searchParams.get('token') : null;
  return headerToken === AUTH_TOKEN || queryToken === AUTH_TOKEN;
}

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (!isAuthorized(req)) {
    res.statusCode = 401;
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ error: 'Unauthorized' }));
    return;
  }

  await handleMcpRequest(req, res);
}

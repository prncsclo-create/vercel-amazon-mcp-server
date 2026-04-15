# Amazon Cart MCP Server

Amazon cart automation MCP server refactored for Vercel deployment.

## What changed

- Express removed in favor of Vercel Serverless Functions under `api/`
- Local disk session storage removed
- Amazon browser cookies are serialized into a signed stateless session token
- Puppeteer now uses `puppeteer-core` with `@sparticuz/chromium` for serverless runtimes
- In-memory server transport maps and background intervals removed

## Deployment

### Vercel

1. Set these environment variables in Vercel:
   - `AUTH_TOKEN`
   - `AMAZON_DOMAIN` if needed
   - `SESSION_SECRET` recommended
   - `CHROME_EXECUTABLE_PATH` only if running outside Vercel

2. Deploy the repo to Vercel.

3. Use the following endpoints:
   - `GET /health`
   - `POST /mcp`

The repo also rewrites these to Vercel functions:
- `/health` → `/api/health`
- `/mcp` → `/api/mcp`

### Stateless session usage

Amazon login state is returned as a `sessionToken` in tool results. Pass that token back into later tool calls using the optional `sessionToken` field.

Example flow:
1. Call `check_login`
2. Use the returned `sessionToken` in `search_amazon`, `add_to_cart`, or `view_cart`

## Local development

- `npx vercel dev` runs the server locally
- `npm run lint` type-checks the project
- `npm run build` emits the compiled TypeScript output

## Disclaimer

This project uses browser automation to interact with Amazon.com. Use responsibly and in accordance with Amazon's terms.

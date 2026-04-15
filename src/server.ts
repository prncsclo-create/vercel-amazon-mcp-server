import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { randomUUID } from 'crypto';
import { addToCart, checkLoginStatus, getCart, searchProducts } from './amazon';
import { addToWholeFoodsCart, getWholeFoodsCart, searchWholeFoods } from './wholefoods';

const TOOLS = [
  {
    name: 'search_amazon',
    description: 'Search for products on Amazon',
    inputSchema: {
      type: 'object' as const,
      properties: {
        query: { type: 'string', description: 'Search query for Amazon products' },
        sessionToken: { type: 'string', description: 'Stateless Amazon session token returned by a previous tool call',  },
      },
      required: ['query'],
    },
  },
  {
    name: 'add_to_cart',
    description: 'Add a product to Amazon cart',
    inputSchema: {
      type: 'object' as const,
      properties: {
        query: { type: 'string', description: 'Product name to search and add' },
        asin: { type: 'string', description: 'Amazon ASIN (product ID) - use this if known' },
        quantity: { type: 'number', description: 'Quantity to add (default: 1)', default: 1 },
        sessionToken: { type: 'string', description: 'Stateless Amazon session token returned by a previous tool call',  },
      },
    },
  },
  {
    name: 'view_cart',
    description: 'View current Amazon cart contents',
    inputSchema: {
      type: 'object' as const,
      properties: {
        sessionToken: { type: 'string', description: 'Stateless Amazon session token returned by a previous tool call',  },
      },
    },
  },
  {
    name: 'check_login',
    description: 'Check if logged into Amazon',
    inputSchema: {
      type: 'object' as const,
      properties: {
        sessionToken: { type: 'string', description: 'Stateless Amazon session token returned by a previous tool call',  },
      },
    },
  },
  {
    name: 'save_session',
    description: 'Refresh the stateless Amazon session token for later reuse.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        sessionToken: { type: 'string', description: 'Stateless Amazon session token returned by a previous tool call',  },
      },
    },
  },
  {
    name: 'search_wholefoods',
    description: 'Search for grocery products on Whole Foods Market via Amazon.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        query: { type: 'string', description: 'Search query for Whole Foods grocery products' },
        sessionToken: { type: 'string', description: 'Stateless Amazon session token returned by a previous tool call',  },
      },
      required: ['query'],
    },
  },
  {
    name: 'add_to_wholefoods_cart',
    description: 'Add a grocery product to the Whole Foods / Amazon Fresh cart.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        query: { type: 'string', description: 'Product name to search and add from Whole Foods' },
        asin: { type: 'string', description: 'Amazon ASIN (product ID) - use this if known from a previous search' },
        quantity: { type: 'number', description: 'Quantity to add (default: 1)', default: 1 },
        sessionToken: { type: 'string', description: 'Stateless Amazon session token returned by a previous tool call',  },
      },
    },
  },
  {
    name: 'view_wholefoods_cart',
    description: 'View the current Whole Foods / Amazon Fresh grocery cart contents and subtotal.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        sessionToken: { type: 'string', description: 'Stateless Amazon session token returned by a previous tool call',  },
      },
    },
  },
];

function createMcpServer(): Server {
  const server = new Server(
    { name: 'amazon-cart-server', version: '2.0.0' },
    { capabilities: { tools: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
      let result;

      switch (name) {
        case 'search_amazon':
          result = await searchProducts((args as { query?: string; sessionToken?: string } | undefined)?.query || '', (args as any)?.sessionToken);
          break;
        case 'add_to_cart':
          result = await addToCart(args as any);
          break;
        case 'view_cart':
          result = await getCart((args as any)?.sessionToken);
          break;
        case 'check_login':
          result = await checkLoginStatus((args as any)?.sessionToken);
          break;
        case 'save_session':
          result = {
            success: true,
            message: 'Session token refreshed.',
            sessionToken: (args as any)?.sessionToken,
          };
          break;
        case 'search_wholefoods':
          result = await searchWholeFoods((args as { query?: string; sessionToken?: string } | undefined)?.query || '', (args as any)?.sessionToken);
          break;
        case 'add_to_wholefoods_cart':
          result = await addToWholeFoodsCart(args as any);
          break;
        case 'view_wholefoods_cart':
          result = await getWholeFoodsCart((args as any)?.sessionToken);
          break;
        default:
          throw new Error(`Unknown tool: ${name}`);
      }

      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                success: false,
                error: error instanceof Error ? error.message : String(error),
              },
              null,
              2,
            ),
          },
        ],
        isError: true,
      };
    }
  });

  return server;
}

export async function handleMcpRequest(req: unknown, res: unknown): Promise<void> {
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: () => randomUUID(),
  });

  const server = createMcpServer();
  await server.connect(transport);
  await transport.handleRequest(req as never, res as never, (req as { body?: unknown })?.body);
}

export { createMcpServer, TOOLS };

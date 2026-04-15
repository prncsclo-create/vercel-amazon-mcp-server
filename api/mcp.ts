import { app } from '../src/server';

export const config = {
  api: {
    bodyParser: false,
  },
};

export default function handler(req: any, res: any) {
  if (typeof req.url === 'string' && req.url.startsWith('/api')) {
    req.url = req.url.replace(/^\/api/, '') || '/';
  }

  return app(req, res);
}

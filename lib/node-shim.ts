/**
 * Node 风格 (req, res) 到 Web 标准 (Request) => Response 的适配
 * Vercel Node 函数与 Express 共用
 */

import { handleRequest } from './app.js';

export interface NodeLikeRequest {
  method?: string;
  url?: string;
  headers: Record<string, string | string[] | undefined>;
}

export interface NodeLikeResponse {
  status(code: number): NodeLikeResponse;
  setHeader(name: string, value: string): void;
  end(body?: string): void;
}

export type WebHandler = (request: Request, env: Record<string, string | undefined>) => Promise<Response>;

function toHeaders(raw: NodeLikeRequest['headers']): Record<string, string> {
  const headers: Record<string, string> = {};
  for (const [name, value] of Object.entries(raw)) {
    if (value === undefined) continue;
    headers[name] = Array.isArray(value) ? value.join(', ') : value;
  }
  return headers;
}

export function nodeStyle(handler: WebHandler = handleRequest) {
  return async (req: NodeLikeRequest, res: NodeLikeResponse): Promise<void> => {
    const host = req.headers.host ?? 'localhost';
    const request = new Request(new URL(req.url ?? '/', `https://${host}`), {
      method: req.method ?? 'GET',
      headers: toHeaders(req.headers),
    });

    const response = await handler(request, process.env);

    res.status(response.status);
    response.headers.forEach((value, name) => res.setHeader(name, value));
    res.end(await response.text());
  };
}

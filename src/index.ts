import { handleRequest, type Env } from '../lib/app.js';

export default {
  fetch: (request: Request, env: Env): Promise<Response> => handleRequest(request, env),
};

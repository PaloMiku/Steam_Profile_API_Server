import { handleRequest } from '../../lib/app.js';

export default (req: Request): Promise<Response> => handleRequest(req, process.env);

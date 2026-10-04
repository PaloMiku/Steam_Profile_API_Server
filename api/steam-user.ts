import { handleRequest } from '../lib/app.js';
import { nodeStyle } from '../lib/node-shim.js';

export default nodeStyle(handleRequest);

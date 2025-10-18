/**
 * Netlify 适配器 - 将通用处理器转换为 Netlify 格式
 */

export interface NetlifyResponse {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
}

/**
 * 添加 CORS headers
 */
export function getCorsHeaders(): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json; charset=utf-8',
  };
}

/**
 * 返回成功响应
 */
export function sendSuccess(data: unknown, statusCode = 200): NetlifyResponse {
  return {
    statusCode,
    headers: getCorsHeaders(),
    body: JSON.stringify(data),
  };
}

/**
 * 返回错误响应
 */
export function sendError(
  statusCode: number,
  message: string,
  code: string
): NetlifyResponse {
  return {
    statusCode,
    headers: getCorsHeaders(),
    body: JSON.stringify({
      success: false,
      error: message,
      code,
    }),
  };
}

/**
 * 处理 CORS 预检请求
 */
export function handleCorsPreFlight(): NetlifyResponse {
  return {
    statusCode: 200,
    headers: getCorsHeaders(),
    body: '',
  };
}

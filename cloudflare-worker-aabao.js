// Cloudflare Worker for AABao API Proxy
// 专门用于代理 https://api.aabao.top 的 Nano Banana API
// 解决 Node.js undici 超时和连接稳定性问题

export default {
  async fetch(request, env, ctx) {
    // ========== CORS 预检请求处理 ==========
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-goog-api-key',
        },
      });
    }

    const requestId = crypto.randomUUID().slice(0, 8);
    console.log(`[AABao-Worker:${requestId}] ========== NEW REQUEST ==========`);
    console.log(`[AABao-Worker:${requestId}] Method: ${request.method}`);
    console.log(`[AABao-Worker:${requestId}] Path: ${new URL(request.url).pathname}`);

    try {
      const url = new URL(request.url);

      // ========== 构建目标 URL ==========
      // AABao API endpoint: https://api.aabao.top/v1beta/models/{model}:generateContent/
      const aabaoHost = env.AABAO_API_HOST || 'https://api.aabao.top';
      const targetUrl = new URL(url.pathname + url.search, aabaoHost);

      console.log(`[AABao-Worker:${requestId}] Target URL: ${targetUrl.href}`);

      // ========== 获取请求体 ==========
      const requestBody = await request.json();
      console.log(`[AABao-Worker:${requestId}] Request body keys:`, Object.keys(requestBody));

      // ========== 构建代理请求 Headers ==========
      const headers = new Headers();

      // 过滤掉可能导致问题的 headers
      const problematicHeaders = [
        'host',
        'connection',
        'content-length',
        'transfer-encoding',
        'keep-alive',
        'proxy-authenticate',
        'proxy-authorization',
        'te',
        'trailers',
        'upgrade'
      ];

      for (const [key, value] of request.headers.entries()) {
        const lowerKey = key.toLowerCase();
        if (!problematicHeaders.includes(lowerKey)) {
          headers.set(key, value);
        }
      }

      // 确保有 Authorization header
      if (!headers.has('Authorization') && env.AABAO_API_KEY) {
        headers.set('Authorization', `Bearer ${env.AABAO_API_KEY}`);
        console.log(`[AABao-Worker:${requestId}] Added Authorization from env`);
      }

      // 添加 User-Agent
      headers.set('User-Agent', 'node-banana-aabao-worker/1.0');

      console.log(`[AABao-Worker:${requestId}] Headers count: ${headers.size}`);

      // ========== 创建带超时的请求 ==========
      // AABao API 2K/4K 生成可能需要 2-5 分钟
      const controller = new AbortController();
      const timeout = 300000; // 5 分钟超时
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      console.log(`[AABao-Worker:${requestId}] Sending request (timeout: ${timeout}ms)...`);

      const startTime = Date.now();

      // 发送请求到 AABao API
      const proxyRequest = new Request(targetUrl, {
        method: request.method,
        headers,
        body: JSON.stringify(requestBody),
        // @ts-ignore - AbortController.signal is supported in Cloudflare Workers
        signal: controller.signal,
      });

      const response = await fetch(proxyRequest);

      clearTimeout(timeoutId);

      const duration = Date.now() - startTime;
      console.log(`[AABao-Worker:${requestId}] Response received in ${duration}ms, status: ${response.status}`);

      // ========== 获取响应体 ==========
      const responseText = await response.text();
      const responseSize = responseText.length;

      console.log(`[AABao-Worker:${requestId}] Response body size: ${(responseSize / 1024).toFixed(2)}KB`);

      // ========== 返回响应 ==========
      return new Response(responseText, {
        status: response.status,
        statusText: response.statusText,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-goog-api-key',
          'Content-Length': responseSize.toString(),
        },
      });

    } catch (error) {
      console.error(`[AABao-Worker:${requestId}] ❌ ERROR:`, error.message);

      // 检查是否是超时错误
      if (error.name === 'AbortError') {
        return new Response(
          JSON.stringify({
            error: 'Request timeout',
            message: 'AABao API request timeout after 5 minutes. Please try with a lower resolution or simpler prompt.'
          }),
          {
            status: 408,
            headers: {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*'
            }
          }
        );
      }

      return new Response(
        JSON.stringify({
          error: 'Worker proxy error',
          message: error.message,
          stack: error.stack
        }),
        {
          status: 500,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          }
        }
      );
    }
  }
};

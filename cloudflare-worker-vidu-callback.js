// Cloudflare Worker - 支持 Google AI 代理 + VIDU 回调转发
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;

    console.log(`Worker request: ${request.method} ${path}`);

    // ===== 健康检查端点 =====
    if (path === '/health') {
      console.log('Health check requested');
      console.log('Environment VIDU_SERVER_URL:', env.VIDU_SERVER_URL);
      try {
        const serverUrl = env.VIDU_SERVER_URL || 'http://101.126.147.111:3012';
        // 使用 /worker-health 端点而不是 /api/health，避免 nginx 代理拦截
        const healthUrl = `${serverUrl}/worker-health`;
        console.log('Fetching health from:', healthUrl);

        // 添加必要的请求头，避免 403 错误
        const healthCheck = await fetch(healthUrl, {
          headers: {
            'User-Agent': 'Cloudflare-Worker-HealthCheck/1.0',
            'Accept': 'application/json',
          }
        });

        console.log('Health check response status:', healthCheck.status);
        console.log('Health check response ok:', healthCheck.ok);

        return new Response(JSON.stringify({
          status: 'ok',
          server: healthCheck.ok ? 'reachable' : 'unreachable',
          debug: {
            serverUrl: serverUrl,
            healthUrl: healthUrl,
            responseStatus: healthCheck.status,
            responseOk: healthCheck.ok
          }
        }), {
          headers: { 'Content-Type': 'application/json' }
        });
      } catch (error) {
        console.error('Health check error:', error);
        return new Response(JSON.stringify({
          status: 'error',
          error: error.message,
          debug: {
            errorMessage: error.message,
            errorStack: error.stack
          }
        }), {
          status: 503,
          headers: { 'Content-Type': 'application/json' }
        });
      }
    }

    // ===== VIDU 回调转发 =====
    if (path.startsWith('/api/vidu-callback')) {
      console.log('Forwarding VIDU callback to server');
      console.log('Environment VIDU_SERVER_URL:', env.VIDU_SERVER_URL);

      // 使用环境变量配置服务器地址
      const serverUrl = env.VIDU_SERVER_URL || 'http://101.126.147.111:3012';
      const targetUrl = `${serverUrl}/api/vidu-callback${url.search}`;

      console.log(`Target URL: ${targetUrl}`);

      // 转发请求到服务器（带重试）
      try {
        const responseData = await fetchWithRetry(request, targetUrl);
        console.log(`VIDU callback forwarded successfully`);
        return new Response(responseData, {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
          },
        });
      } catch (error) {
        console.error(`VIDU callback failed after retries:`, error);
        return new Response(JSON.stringify({
          success: false,
          error: 'Failed to forward callback to server'
        }), {
          status: 502,
          headers: { 'Content-Type': 'application/json' }
        });
      }
    }

    // ===== Google AI API 代理（原有功能 - 保持不变）=====
    // 处理 CORS 预检请求
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-goog-api-key',
        },
      });
    }

    try {
      const url = new URL(request.url);

      // 判断请求类型：Gemini API 格式 vs 标准 Vertex AI REST API 格式
      const isGeminiAPIFormat = url.pathname.includes('/publishers/google/models/');

      let targetUrl;

      if (isGeminiAPIFormat) {
        // Gemini API 格式：直接使用 aiplatform.googleapis.com
        // 路径格式: /v1beta1/publishers/google/models/{model}:generateContent
        targetUrl = new URL(url.pathname + url.search, `https://aiplatform.googleapis.com`);

        console.log(`[Worker] ========== NEW REQUEST (Gemini API) ==========`);
        console.log(`[Worker] Original path: ${url.pathname}`);
        console.log(`[Worker] Using Gemini API format (no project/location prefix)`);
        console.log(`[Worker] Target URL: ${targetUrl.href}`);
      } else {
        // 标准 Vertex AI REST API 格式
        const projectId = 'xinshijue-ai';
        const location = 'us-central1';
        const vertexAIHost = 'us-central1-aiplatform.googleapis.com';

        let modelEndpoint = url.pathname;

        // 如果路径不包含 projects/locations，需要添加
        if (!modelEndpoint.includes('/projects/') && !modelEndpoint.includes('/locations/')) {
          const pathMatch = modelEndpoint.match(/\/v\d+(?:beta\d*)?\/(.+)/);
          if (pathMatch) {
            const modelPath = pathMatch[1];
            modelEndpoint = `/v1/projects/${projectId}/locations/${location}/${modelPath}`;
          }
        }

        targetUrl = new URL(modelEndpoint + url.search, `https://${vertexAIHost}`);

        console.log(`[Worker] ========== NEW REQUEST (Vertex AI REST API) ==========`);
        console.log(`[Worker] Original path: ${url.pathname}`);
        console.log(`[Worker] Final endpoint: ${modelEndpoint}`);
        console.log(`[Worker] Target URL: ${targetUrl.href}`);
      }

      // 获取请求体
      const requestBody = await request.json();

      // 深度转换 camelCase 到 snake_case（用于 Vertex AI REST API）
      function toSnakeCase(obj) {
        if (obj === null || typeof obj !== 'object') {
          return obj;
        }

        if (Array.isArray(obj)) {
          return obj.map(toSnakeCase);
        }

        const result = {};
        for (const [key, value] of Object.entries(obj)) {
          // Convert camelCase to snake_case
          const snakeKey = key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);

          // Handle special cases for Vertex AI API
          let finalKey = snakeKey;
          if (key === 'config') {
            finalKey = 'generation_config';
          } else if (key === 'generationConfig') {
            finalKey = 'generation_config';
          }

          result[finalKey] = toSnakeCase(value);
        }
        return result;
      }

      const convertedBody = toSnakeCase(requestBody);

      console.log(`[Worker] Converted request:`, JSON.stringify(convertedBody, null, 2));

      // 构建代理请求 headers，过滤掉可能导致冲突的 headers
      const headers = new Headers();
      const problematicHeaders = ['host', 'connection', 'content-length', 'transfer-encoding'];

      for (const [key, value] of request.headers.entries()) {
        const lowerKey = key.toLowerCase();
        if (!problematicHeaders.includes(lowerKey)) {
          headers.set(key, value);
        }
      }

      // 添加 API key（总是使用环境变量中的 key，确保正确认证）
      if (env.GOOGLE_API_KEY) {
        headers.set('x-goog-api-key', env.GOOGLE_API_KEY);
      }

      const proxyRequest = new Request(targetUrl, {
        method: request.method,
        headers,
        body: JSON.stringify(convertedBody),
      });

      // 发送请求到 Vertex AI
      const response = await fetch(proxyRequest);

      console.log(`[Worker] Response status: ${response.status}`);

      // 获取响应体
      const responseText = await response.text();

      // 返回响应
      return new Response(responseText, {
        status: response.status,
        statusText: response.statusText,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-goog-api-key',
        },
      });

    } catch (error) {
      console.error('[Worker] Error:', error);
      return new Response(
        JSON.stringify({ error: 'Proxy error', message: error.message }),
        {
          status: 500,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          }
        }
      );
    }
  },
};

// ===== 重试逻辑 =====
async function fetchWithRetry(originalRequest, targetUrl, maxRetries = 3) {
  // 读取并存储 body（因为 ReadableStream 只能读取一次）
  let requestBody = null;
  try {
    requestBody = await originalRequest.text();
  } catch (e) {
    // 如果无法读取 body（比如 GET 请求），使用 null
    requestBody = null;
  }

  for (let i = 0; i < maxRetries; i++) {
    try {
      // 复制原始 headers 并添加 User-Agent
      const headers = new Headers();
      for (const [key, value] of originalRequest.headers.entries()) {
        headers.set(key, value);
      }
      // 添加 User-Agent 避免被服务器拒绝
      headers.set('User-Agent', 'Cloudflare-Worker-Callback/1.0');

      // 构建新的请求对象
      const proxyRequest = new Request(targetUrl, {
        method: originalRequest.method,
        headers: headers,
        body: requestBody,  // 使用存储的 body
      });

      const response = await fetch(proxyRequest);

      if (response.ok) {
        const text = await response.text();
        console.log(`Attempt ${i + 1}/${maxRetries} succeeded`);
        return text;
      }

      console.log(`Attempt ${i + 1}/${maxRetries} failed with status ${response.status}`);

      // 如果不是最后一次尝试，等待后重试
      if (i < maxRetries - 1) {
        // 指数退避: 1s, 2s, 4s
        const delay = Math.pow(2, i) * 1000;
        console.log(`Retrying after ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    } catch (error) {
      console.error(`Attempt ${i + 1}/${maxRetries} error:`, error.message);

      // 如果是最后一次尝试，抛出错误
      if (i === maxRetries - 1) {
        throw error;
      }

      // 等待后重试
      const delay = Math.pow(2, i) * 1000;
      console.log(`Retrying after ${delay}ms...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  throw new Error('Max retries exceeded');
}

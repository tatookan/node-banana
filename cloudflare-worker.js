// Cloudflare Worker for Google Vertex AI API Proxy
// 支持 Gemini API 格式 (使用 API Key 认证)

export default {
  async fetch(request, env, ctx) {
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

      // 转换请求格式：config -> generation_config (snake_case for Vertex AI REST API)
      const convertedBody = {};
      for (const [key, value] of Object.entries(requestBody)) {
        // Convert camelCase keys to snake_case for Vertex AI REST API
        if (key === 'config') {
          convertedBody.generation_config = value;
        } else if (key === 'generationConfig') {
          convertedBody.generation_config = value;
        } else if (key === 'imageConfig') {
          convertedBody.image_config = value;
        } else {
          convertedBody[key] = value;
        }
      }

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

// Cloudflare Worker for Google Vertex AI and AABao API Proxy
// 支持 Gemini API 格式 (Google) 和 AABao Nano Banana API

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

      // ========== 路由: 检查是否为 AABao API 请求 ==========
      // 通过路径前缀 /aabao/ 或 X-API-Provider 请求头来识别
      const isAabaoRequest = url.pathname.startsWith('/aabao/') ||
                             request.headers.get('X-API-Provider') === 'aabao';

      if (isAabaoRequest) {
        return handleAabaoRequest(request, url, env);
      }

      // ========== 路由: Google Vertex AI API 请求 ==========
      return handleGoogleRequest(request, url, env);

    } catch (error) {
      console.error('[Worker] Error:', error);
      return new Response(
        JSON.stringify({ error: 'Proxy error', message: error.message }),
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

// ========== AABao API 处理函数 ==========
async function handleAabaoRequest(request, url, env) {
  console.log(`[Worker-AABao] ========== NEW REQUEST ==========`);
  console.log(`[Worker-AABao] Path: ${url.pathname}`);

  // 构建目标 URL - 移除 /aabao 前缀
  const pathname = url.pathname.replace(/^\/aabao/, '');
  const aabaoHost = env.AABAO_API_HOST || 'https://cf-api.aabao.top';
  const targetUrl = new URL(pathname + url.search, aabaoHost);

  console.log(`[Worker-AABao] Target: ${targetUrl.href}`);

  // 获取请求体 - 添加错误处理
  let requestBody = {};
  const contentType = request.headers.get('content-type') || '';

  if (contentType.includes('application/json')) {
    try {
      const text = await request.text();
      if (text.trim()) {
        requestBody = JSON.parse(text);
        console.log(`[Worker-AABao] Request keys:`, Object.keys(requestBody));
      } else {
        console.log(`[Worker-AABao] Empty request body`);
      }
    } catch (e) {
      console.error(`[Worker-AABao] JSON parse error:`, e.message);
      requestBody = {};
    }
  }

  // 构建代理请求 headers
  const headers = new Headers();
  const problematicHeaders = [
    'host', 'connection', 'content-length', 'transfer-encoding',
    'keep-alive', 'proxy-authenticate', 'proxy-authorization', 'te', 'trailers', 'upgrade'
  ];

  for (const [key, value] of request.headers.entries()) {
    const lowerKey = key.toLowerCase();
    if (!problematicHeaders.includes(lowerKey)) {
      headers.set(key, value);
    }
  }

  // 如果请求中没有 Authorization，使用环境变量中的 API Key
  if (!headers.has('Authorization') && env.AABAO_API_KEY) {
    headers.set('Authorization', `Bearer ${env.AABAO_API_KEY}`);
    console.log(`[Worker-AABao] Added Authorization from env`);
  }

  // 创建带超时的请求 (5分钟用于 4K 生成)
  const controller = new AbortController();
  const timeout = 300000;
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  console.log(`[Worker-AABao] Sending request (timeout: ${timeout}ms)...`);

  const startTime = Date.now();

  // 构建代理请求选项
  const proxyOptions = {
    method: request.method,
    headers,
    // @ts-ignore
    signal: controller.signal,
  };

  // 只有非 GET/HEAD 请求才添加 body
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    proxyOptions.body = JSON.stringify(requestBody);
  }

  const proxyRequest = new Request(targetUrl, proxyOptions);

  const response = await fetch(proxyRequest);

  clearTimeout(timeoutId);

  const duration = Date.now() - startTime;
  console.log(`[Worker-AABao] Response in ${duration}ms, status: ${response.status}`);

  const responseText = await response.text();
  console.log(`[Worker-AABao] Response size: ${(responseText.length / 1024).toFixed(2)}KB`);

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
}

// ========== Google Vertex AI 处理函数 ==========
async function handleGoogleRequest(request, url, env) {
  console.log(`[Worker-Google] ========== NEW REQUEST ==========`);
  console.log(`[Worker-Google] Path: ${url.pathname}`);

  // 判断请求类型：Gemini API 格式 vs 标准 Vertex AI REST API 格式
  const isGeminiAPIFormat = url.pathname.includes('/publishers/google/models/');

  let targetUrl;

  if (isGeminiAPIFormat) {
    // Gemini API 格式：直接使用 aiplatform.googleapis.com
    targetUrl = new URL(url.pathname + url.search, `https://aiplatform.googleapis.com`);
    console.log(`[Worker-Google] Using Gemini API format`);
    console.log(`[Worker-Google] Target: ${targetUrl.href}`);
  } else {
    // 标准 Vertex AI REST API 格式
    const projectId = 'xinshijue-ai';
    const location = 'us-central1';
    const vertexAIHost = 'us-central1-aiplatform.googleapis.com';

    let modelEndpoint = url.pathname;

    if (!modelEndpoint.includes('/projects/') && !modelEndpoint.includes('/locations/')) {
      const pathMatch = modelEndpoint.match(/\/v\d+(?:beta\d*)?\/(.+)/);
      if (pathMatch) {
        const modelPath = pathMatch[1];
        modelEndpoint = `/v1/projects/${projectId}/locations/${location}/${modelPath}`;
      }
    }

    targetUrl = new URL(modelEndpoint + url.search, `https://${vertexAIHost}`);
    console.log(`[Worker-Google] Using Vertex AI REST API`);
    console.log(`[Worker-Google] Target: ${targetUrl.href}`);
  }

  // 获取请求体 - 添加错误处理
  let requestBody = {};
  const contentType = request.headers.get('content-type') || '';

  if (contentType.includes('application/json')) {
    try {
      const text = await request.text();
      if (text.trim()) {
        requestBody = JSON.parse(text);
      }
    } catch (e) {
      console.error(`[Worker-Google] JSON parse error:`, e.message);
      requestBody = {};
    }
  }

  // 转换请求格式：config -> generation_config
  const convertedBody = {};
  for (const [key, value] of Object.entries(requestBody)) {
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

  console.log(`[Worker-Google] Converted request:`, JSON.stringify(convertedBody, null, 2));

  // 构建代理请求 headers
  const headers = new Headers();
  const problematicHeaders = ['host', 'connection', 'content-length', 'transfer-encoding'];

  for (const [key, value] of request.headers.entries()) {
    const lowerKey = key.toLowerCase();
    if (!problematicHeaders.includes(lowerKey)) {
      headers.set(key, value);
    }
  }

  // 添加 Google API key
  if (env.GOOGLE_API_KEY) {
    headers.set('x-goog-api-key', env.GOOGLE_API_KEY);
  }

  // 构建代理请求选项
  const proxyOptions = {
    method: request.method,
    headers,
  };

  // 只有非 GET/HEAD 请求才添加 body
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    proxyOptions.body = JSON.stringify(convertedBody);
  }

  const proxyRequest = new Request(targetUrl, proxyOptions);

  const response = await fetch(proxyRequest);

  console.log(`[Worker-Google] Response status: ${response.status}`);

  const responseText = await response.text();

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
}

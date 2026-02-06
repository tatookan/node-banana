// Cloudflare Worker for Google Vertex AI, AABao API and VIDU API Proxy
// 支持 Gemini API 格式 (Google), AABao Nano Banana API, 和 VIDU 视频 API
//
// ===== 付费版优化功能 =====
// - Worker 解析 JSON（不再透传给 Next.js）
// - Worker 上传到 R2（使用 R2 绑定）
// - 返回 R2 引用（而非完整 JSON）

export default {
  async fetch(request, env, ctx) {
    // 处理 CORS 预检请求
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-goog-api-key, X-User-Id',
        },
      });
    }

    try {
      const url = new URL(request.url);

      // ========== 路由: VIDU 回调端点 ==========
      // VIDU 回调需要转发到本地 Next.js 服务器
      if (url.pathname === '/api/vidu-callback') {
        return handleCallbackRequest(request, url, env);
      }

      // ========== 路由: 检查是否为 VIDU API 请求 ==========
      // 通过路径前缀 /vidu/ 或 /api/vidu- 来识别
      const isViduRequest = url.pathname.startsWith('/vidu/') ||
                             url.pathname.startsWith('/api/vidu-');

      if (isViduRequest) {
        return handleViduRequest(request, url, env);
      }

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

// ========== 上传 Base64 图片到 R2 ==========
async function uploadToR2(env, base64Data, userId) {
  try {
    // 提取 Base64 数据（可能带 data:image/jpeg;base64, 前缀）
    let base64String;
    if (base64Data.includes(',')) {
      base64String = base64Data.split(',')[1];
    } else {
      base64String = base64Data;
    }

    if (!base64String) {
      throw new Error('Invalid base64 data');
    }

    // 转换为 Uint8Array
    const binaryString = atob(base64String);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    // 生成存储 key
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);
    const imageKey = `${userId}/generation/${timestamp}-${random}.jpeg`;

    // 上传到 R2（使用 R2 绑定）
    if (!env.R2_BUCKET) {
      throw new Error('R2_BUCKET binding not configured. Please add R2 binding in Worker Settings.');
    }

    await env.R2_BUCKET.put(imageKey, bytes, {
      httpMetadata: {
        contentType: 'image/jpeg',
      },
    });

    console.log(`[Worker-R2] Uploaded: ${imageKey}, size: ${(bytes.length / 1024).toFixed(2)}KB`);

    // 返回 R2 引用
    return `r2:${imageKey}`;
  } catch (error) {
    console.error('[Worker-R2] Upload failed:', error);
    throw error;
  }
}

// ========== AABao API 处理函数 ==========
async function handleAabaoRequest(request, url, env) {
  console.log(`[Worker-AABao] ========== NEW REQUEST ==========`);
  console.log(`[Worker-AABao] Path: ${url.pathname}`);

  // 构建目标 URL - 移除 /aabao 前缀
  const pathname = url.pathname.replace(/^\/aabao/, '');
  const aabaoHost = env.AABAO_API_HOST || 'https://api.aabao.top';
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
  console.log(`[Worker-AABao] Response size: ${(responseText.length / 1024 / 1024).toFixed(2)}MB`);

  // 检查响应状态
  if (response.status !== 200) {
    console.error(`[Worker-AABao] API returned error: ${response.status}`);
    return new Response(responseText, {
      status: response.status,
      statusText: response.statusText,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-goog-api-key, X-User-Id',
      },
    });
  }

  // ===== NEW: 解析 JSON 并上传 R2 =====
  try {
    // 解析 JSON
    console.log(`[Worker-AABao] Parsing JSON...`);
    const startTimeParse = Date.now();
    const data = JSON.parse(responseText);
    const parseTime = Date.now() - startTimeParse;
    console.log(`[Worker-AABao] ✓ JSON parsed in ${parseTime}ms`);

    // 提取 Base64 图片
    const base64Image = data.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (!base64Image) {
      throw new Error('No image found in response');
    }

    console.log(`[Worker-AABao] Extracted base64 image: ${(base64Image.length / 1024).toFixed(2)}KB`);

    // 获取 user_id（从请求头或查询参数）
    const userId = request.headers.get('X-User-Id') || url.searchParams.get('user_id') || '1';
    console.log(`[Worker-AABao] Using userId: ${userId}`);

    // 上传到 R2
    console.log(`[Worker-AABao] Uploading to R2...`);
    const startTimeUpload = Date.now();
    const imageRef = await uploadToR2(env, base64Image, userId);
    const uploadTime = Date.now() - startTimeUpload;
    console.log(`[Worker-AABao] ✓ R2 upload complete in ${uploadTime}ms`);

    // 返回 R2 引用
    const result = {
      success: true,
      imageRef: imageRef,
      _workerMetrics: {
        parseTime: `${parseTime}ms`,
        uploadTime: `${uploadTime}ms`,
      },
    };

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-goog-api-key, X-User-Id',
      },
    });

  } catch (error) {
    // 降级：返回原始 JSON，让 Next.js 处理
    console.error(`[Worker-AABao] Processing failed:`, error.message);
    console.log(`[Worker-AABao] Falling back to raw JSON mode`);

    return new Response(responseText, {
      status: response.status,
      statusText: response.statusText,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-goog-api-key, X-User-Id',
        'X-Worker-Fallback': 'json-only',
      },
    });
  }
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

// ========== VIDU API 处理函数 ==========
async function handleViduRequest(request, url, env) {
  console.log(`[Worker-VIDU] ========== NEW REQUEST ==========`);
  console.log(`[Worker-VIDU] Path: ${url.pathname}`);

  // 构建目标 URL - 移除 /vidu 前缀
  const pathname = url.pathname.replace(/^\/vidu/, '');
  const viduHost = env.VIDU_API_HOST || 'https://api.vidu.cn';
  const viduPath = env.VIDU_API_PATH || '/ent/v2';
  const targetUrl = new URL(viduPath + pathname + url.search, viduHost);

  console.log(`[Worker-VIDU] Target: ${targetUrl.href}`);

  // 获取请求体 - 添加错误处理
  let requestBody = {};
  const contentType = request.headers.get('content-type') || '';

  if (contentType.includes('application/json')) {
    try {
      const text = await request.text();
      if (text.trim()) {
        requestBody = JSON.parse(text);
        console.log(`[Worker-VIDU] Request keys:`, Object.keys(requestBody));
      } else {
        console.log(`[Worker-VIDU] Empty request body`);
      }
    } catch (e) {
      console.error(`[Worker-VIDU] JSON parse error:`, e.message);
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

  // 添加 VIDU API Key（如果请求中没有）
  if (!headers.has('Authorization') && env.VIDU_API_KEY) {
    headers.set('Authorization', `Token ${env.VIDU_API_KEY}`);
    console.log(`[Worker-VIDU] Added Authorization from env`);
  }

  // 创建带超时的请求 (10分钟用于视频生成)
  const controller = new AbortController();
  const timeout = 600000; // 10 分钟
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  console.log(`[Worker-VIDU] Sending request (timeout: ${timeout}ms)...`);

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
  console.log(`[Worker-VIDU] Response in ${duration}ms, status: ${response.status}`);

  const responseText = await response.text();
  console.log(`[Worker-VIDU] Response size: ${(responseText.length / 1024).toFixed(2)}KB`);

  // 返回响应
  return new Response(responseText, {
    status: response.status,
    statusText: response.statusText,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}

// ========== VIDU 回调处理函数 ==========
// 转发 VIDU 回调到本地 Next.js 服务器
async function handleCallbackRequest(request, url, env) {
  console.log(`[Worker-Callback] ========== NEW CALLBACK ==========`);
  console.log(`[Worker-Callback] Path: ${url.pathname}`);

  // 获取本地服务器地址（需要配置环境变量）
  const localServer = env.LOCAL_SERVER_URL || 'http://localhost:3000';
  const targetUrl = new URL(url.pathname + url.search, localServer);

  console.log(`[Worker-Callback] Forwarding to: ${targetUrl.href}`);

  // 获取请求体
  const requestBody = await request.text();
  console.log(`[Worker-Callback] Request body length: ${requestBody.length} bytes`);

  // 构建转发请求的 headers
  const headers = new Headers();
  for (const [key, value] of request.headers.entries()) {
    const lowerKey = key.toLowerCase();
    if (!['host', 'connection', 'content-length'].includes(lowerKey)) {
      headers.set(key, value);
    }
  }

  if (requestBody.length > 0) {
    headers.set('Content-Length', requestBody.length.toString());
  }

  // 转发请求到本地服务器
  const response = await fetch(targetUrl.toString(), {
    method: request.method,
    headers,
    body: requestBody || undefined,
  });

  console.log(`[Worker-Callback] Response status: ${response.status}`);

  const responseText = await response.text();
  console.log(`[Worker-Callback] Response length: ${responseText.length} bytes`);

  // 返回响应
  return new Response(responseText, {
    status: response.status,
    statusText: response.statusText,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
  });
}

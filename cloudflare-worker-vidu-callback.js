// Cloudflare Worker - 支持 Google AI 代理 + VIDU 回调转发
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;

    console.log(`Worker request: ${request.method} ${path}`);

    // ===== VIDU 回调转发 =====
    if (path.startsWith('/api/vidu-callback')) {
      console.log('Forwarding VIDU callback to server');

      // 构建目标服务器 URL
      const targetUrl = `http://101.126.147.111:3012/api/vidu-callback${url.search}`;

      // 转发请求到服务器
      const proxyRequest = new Request(targetUrl, {
        method: request.method,
        headers: request.headers,
        body: request.body,
      });

      const response = await fetch(proxyRequest);
      const responseData = await response.text();

      console.log(`VIDU callback response: ${response.status}`);

      return new Response(responseData, {
        status: response.status,
        headers: {
          'Content-Type': 'application/json',
        },
      });
    }

    // ===== Google AI API 代理（原有功能）=====
    // 处理 CORS 预检请求
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        },
      });
    }

    if (request.method !== 'POST') {
      return new Response('Method not allowed', { status: 405 });
    }

    try {
      const body = await request.json();
      const { model, ...restBody } = body;

      // 构建目标 URL（使用环境变量中的 API Key）
      const targetUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${env.GOOGLE_API_KEY}`;

      console.log(`Proxying Google AI request to: ${model}`);

      const proxyRequest = new Request(targetUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(restBody),
      });

      const response = await fetch(proxyRequest);
      const responseData = await response.json();

      return new Response(JSON.stringify(responseData), {
        status: response.status,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        },
      });

    } catch (error) {
      return new Response(
        JSON.stringify({ error: error.message }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }
  },
};

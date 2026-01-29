// Cloudflare Worker - 支持 Google AI 代理 + VIDU 回调转发
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;

    console.log(`Worker request: ${request.method} ${path}`);

    // ===== 健康检查端点 =====
    if (path === '/health') {
      console.log('Health check requested');
      try {
        const serverUrl = env.VIDU_SERVER_URL || 'http://101.126.147.111:3012';
        const healthCheck = await fetch(`${serverUrl}/api/health`);
        return new Response(JSON.stringify({
          status: 'ok',
          server: healthCheck.ok ? 'reachable' : 'unreachable'
        }), {
          headers: { 'Content-Type': 'application/json' }
        });
      } catch (error) {
        return new Response(JSON.stringify({
          status: 'error',
          error: error.message
        }), {
          status: 503,
          headers: { 'Content-Type': 'application/json' }
        });
      }
    }

    // ===== VIDU 回调转发 =====
    if (path.startsWith('/api/vidu-callback')) {
      console.log('Forwarding VIDU callback to server');

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

// ===== 重试逻辑 =====
async function fetchWithRetry(originalRequest, targetUrl, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      // 构建新的请求对象
      const proxyRequest = new Request(targetUrl, {
        method: originalRequest.method,
        headers: originalRequest.headers,
        body: originalRequest.body,
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

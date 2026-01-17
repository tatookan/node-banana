# Cloudflare Workers 反向代理设置指南

## 方案概述

由于 @google/genai SDK 使用自定义的请求格式，最简单的方案是：
1. 创建 Cloudflare Worker 作为 HTTP 代理
2. 修改 API 路由使用原生 fetch 替代 SDK
3. 配置环境变量指向 Worker URL

---

## 第一步：创建 Cloudflare Worker

登录 [Cloudflare Dashboard](https://dash.cloudflare.com/)：
1. 进入 Workers & Pages
2. 创建新 Worker
3. 使用以下代码：

```javascript
// Cloudflare Worker 代码
export default {
  async fetch(request, env, ctx) {
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

      console.log(`Proxying request to: ${model}`);

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
```

---

## 第二步：配置 Worker 环境变量

在 Cloudflare Worker 设置中添加环境变量：
- 变量名：`GOOGLE_API_KEY`
- 值：你的 Google Cloud API Key

---

## 第三步：部署 Worker

1. 保存并部署 Worker
2. 记录 Worker URL，例如：`https://your-worker.your-subdomain.workers.dev`

---

## 第四步：更新环境变量

在项目的 `.env.local` 文件中添加：

```bash
# Cloudflare Worker URL（替换为你的 Worker URL）
CLOUDFLARE_WORKER_URL=https://your-worker.your-subdomain.workers.dev

# 原有的 Google API Key 保留用于备用
GOOGLE_CLOUD_API_KEY=your_api_key
```

---

## 第五步：修改 API 路由

需要修改 `src/app/api/generate/route.ts`，将 SDK 替换为直接使用 fetch。

这样做的优点：
- 完全控制请求端点
- 易于调试
- 支持通过 Cloudflare Worker 代理
- 可以轻松切换回直连

---

## 方案二：使用 Cloudflare Tunnel（无需修改代码）

如果你不想修改代码，可以使用 Cloudflare Tunnel：

1. 安装 cloudflared：
   ```bash
   # macOS
   brew install cloudflared

   # Linux
   wget https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64
   ```

2. 创建隧道：
   ```bash
   cloudflared tunnel --url https://generativelanguage.googleapis.com
   ```

3. 使用隧道 URL 替换 API 端点

---

## 方案三：使用 V2Ray/Clash 等代理工具

在服务器上配置系统级代理，让所有请求都通过代理。

---

## 推荐

我建议使用**方案一**，因为：
1. Cloudflare Workers 免费额度很高（每天 100,000 次请求）
2. 全球 CDN 加速
3. 配置灵活，易于管理
4. 不需要修改服务器环境

需要我帮你实现方案一的代码修改吗？

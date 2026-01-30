# AABao API Cloudflare Worker 部署指南

## 概述

为 AABao API 创建专用的 Cloudflare Worker 代理，解决 Node.js undici 超时问题。

## 文件清单

| 文件 | 说明 |
|------|------|
| `cloudflare-worker-aabao.js` | Worker 代码 |
| `wrangler-aabao.toml` | Worker 配置文件 |
| `.env.example` | 环境变量示例 |

## 部署步骤

### 1. 安装 Wrangler CLI

```bash
npm install -g wrangler
```

### 2. 登录 Cloudflare

```bash
wrangler login
```

### 3. 配置环境变量

在 `.env.local` 中添加：
```bash
# AABao Worker URL (部署后填写)
AABAO_WORKER_URL=https://your-worker.workers.dev
```

### 4. 部署 Worker

```bash
cd /Users/github/node-banana/node-banana

# 使用配置文件部署
wrangler deploy --config wrangler-aabao.toml
```

### 5. 设置 Worker 环境变量

部署后，在 Cloudflare Dashboard 中设置密钥：

1. 访问 https://dash.cloudflare.com
2. 进入 Workers & Pages
3. 选择 `node-banana-aabao-proxy`
4. 点击 "Settings" → "Variables and Secrets"
5. 添加环境变量：
   - 名称: `AABAO_API_KEY`
   - 值: `sk-gXWNhcbbXQAXs3AYAOjNQteCMatrTWNDsXwgTyKGWFQFzHls`
   - 类型: Secret (加密)

### 6. 获取 Worker URL

部署成功后会显示：
```
Published node-banana-aabao-proxy (X.X sec)
  https://node-banana-aabao-proxy.your-subdomain.workers.dev
```

复制这个 URL 到 `.env.local`:
```bash
AABAO_WORKER_URL=https://node-banana-aabao-proxy.your-subdomain.workers.dev
```

### 7. 更新 Next.js 代码

Worker 部署成功后，修改 `src/app/api/generate/route.ts`:

```javascript
// 修改前
const aabaoApiBase = process.env.AABAO_API_BASE || "https://api.aabao.vip";
const endpoint = `${aabaoApiBase}/v1beta/models/${modelId}:generateContent/`;

// 修改后
const aabaoWorkerUrl = process.env.AABAO_WORKER_URL;
if (!aabaoWorkerUrl) {
  throw new Error("AABAO_WORKER_URL not configured");
}
const endpoint = `${aabaoWorkerUrl}/v1beta/models/${modelId}:generateContent/`;
```

### 8. 重启开发服务器

```bash
lsof -ti:3000 | xargs kill -9
npm run dev
```

## Worker 功能

- ✅ CORS 处理
- ✅ 超时控制（5 分钟）
- ✅ 详细日志记录
- ✅ 错误处理
- ✅ 请求 Headers 过滤
- ✅ 自动添加 Authorization

## 测试验证

部署后测试：

```bash
curl -X POST https://your-worker.workers.dev/v1beta/models/gemini-2.5-flash-image:generateContent/ \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -d '{
    "contents": [{
      "role": "user",
      "parts": [{"text": "a cat"}]
    }]
  }'
```

## 故障排除

### 问题: 部署失败
```
解决: 检查 wrangler 是否已登录: wrangler whoami
```

### 问题: 401 Unauthorized
```
解决: 在 Cloudflare Dashboard 中检查 AABAO_API_KEY 是否已设置
```

### 问题: 超时
```
解决: 检查 Worker 的 CPU 限制是否设置为 300000ms
```

## 监控日志

在 Cloudflare Dashboard 中查看 Worker 日志：
1. Workers & Pages → node-banana-aabao-proxy
2. Logs → Real-time logs

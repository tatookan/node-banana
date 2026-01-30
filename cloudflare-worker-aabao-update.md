# 更新现有 Worker 支持 AABao API

## 概述

修改现有的 `cloudflare-worker.js` 来同时支持 Google Vertex AI 和 AABao API。

## 路由设计

```
Cloudflare Worker: https://nano.mygogogo1.de5.net
│
├── /aabao/* → AABao API (https://api.aabao.top)
└── /* → Google Vertex AI (原有逻辑)
```

## 如何部署

### 方法 1: 通过 Cloudflare Dashboard（推荐）

1. **登录 Cloudflare Dashboard**
   - 访问: https://dash.cloudflare.com
   - 进入: Workers & Pages

2. **找到现有 Worker**
   - 查找托管 `nano.mygogogo1.de5.net` 的 Worker
   - 点击进入编辑

3. **更新代码**
   - 复制 `cloudflare-worker.js` 的全部内容
   - 替换 Worker 中的现有代码
   - 点击 "Save and Deploy"

4. **添加 AABao 环境变量**（如果需要）
   - 在 Worker 的 Settings → Variables and Secrets
   - 添加以下变量：
     ```
     名称: AABAO_API_HOST
     值: https://api.aabao.top
     类型: Text

     名称: AABAO_API_KEY
     值: sk-gXWNhcbbXQAXs3AYAOjNQteCMatrTWNDsXwgTyKGWFQFzHls
     类型: Secret (加密)
     ```

### 方法 2: 通过 Wrangler CLI

```bash
# 1. 安装 wrangler（如果还没安装）
npm install -g wrangler

# 2. 登录
wrangler login

# 3. 找到现有 Worker 的配置
# 通常在项目根目录有 wrangler.toml

# 4. 更新 wrangler.toml
[vars]
AABAO_API_HOST = "https://api.aabao.top"

# 5. 部署（会自动使用 cloudflare-worker.js）
wrangler deploy
```

## 验证部署

部署后测试两种路由：

### 测试 Google（原有功能）
```bash
curl -X POST https://nano.mygogogo1.de5.net/v1beta/models/gemini-2.5-flash-experimental:generateContent \
  -H "Content-Type: application/json" \
  -H "x-goog-api-key: YOUR_GOOGLE_KEY" \
  -d '{...}'
```

### 测试 AABao（新功能）
```bash
curl -X POST https://nano.mygogogo1.de5.net/aabao/v1beta/models/gemini-2.5-flash-image:generateContent/ \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_AABAO_KEY" \
  -d '{
    "contents": [{
      "role": "user",
      "parts": [{"text": "a cat"}]
    }]
  }'
```

## 查看日志

在 Cloudflare Dashboard 中：
1. Workers & Pages → 选择 Worker
2. Logs → Real-time logs
3. 查看带 `[Worker-AABao]` 和 `[Worker-Google]` 前缀的日志

## 回滚

如果出现问题，回滚到之前保存的备份：
```bash
cp cloudflare-worker.js.bak cloudflare-worker.js
wrangler deploy
```

## 环境变量

| 变量名 | 用途 | 是否必需 |
|--------|------|----------|
| `AABAO_API_HOST` | AABao API 地址 | 可选 (默认: https://api.aabao.top) |
| `AABAO_API_KEY` | AABao API Key | 可选 (请求头可携带) |
| `GOOGLE_API_KEY` | Google API Key | 可有 (原有配置) |

## 请求路由识别

Worker 通过以下方式识别 AABao 请求：
1. 路径前缀: `/aabao/`
2. 或请求头: `X-API-Provider: aabao`

两种方式都可以触发 AABao 路由。

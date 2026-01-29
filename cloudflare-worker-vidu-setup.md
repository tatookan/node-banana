# Cloudflare Worker 设置 - Google AI 代理 + VIDU 回调转发

## 功能说明

这个 Cloudflare Worker 同时支持：
1. **Google AI API 代理**：转发 Gemini API 请求
2. **VIDU 回调转发**：接收 VIDU 回调并转发到你的服务器

---

## 第一步：更新 Cloudflare Worker

1. 登录 [Cloudflare Dashboard](https://dash.cloudflare.com/)
2. 进入 **Workers & Pages**
3. 选择现有的 Worker `nano.mygogogo1.de5.net`
4. **编辑 Worker 代码**，替换为 `cloudflare-worker-vidu-callback.js` 的内容
5. **保存并部署**

---

## 第二步：配置 Worker 环境变量

在 Worker 设置中添加环境变量（如果还没有）：
- 变量名：`GOOGLE_API_KEY`
- 值：你的 Google Cloud API Key

---

## 第三步：更新服务器环境变量

在服务器的 `.env` 文件中确认以下配置：

```bash
# Cloudflare Worker URL（用于 Google AI 代理和 VIDU 回调）
CLOUDFLARE_WORKER_URL=https://nano.mygogogo1.de5.net

# 本地 URL（用于其他 API，如果需要的话）
NEXT_PUBLIC_APP_URL=http://101.126.147.111:3012
```

---

## 工作原理

### VIDU 回调流程：

```
VIDU 服务器
  ↓ (回调请求)
Cloudflare Worker (nano.mygogogo1.de5.net/api/vidu-callback)
  ↓ (转发)
你的服务器 (101.126.147.111:3012/api/vidu-callback)
```

### Google AI API 代理流程：

```
你的应用
  ↓ (API 请求)
Cloudflare Worker (nano.mygogogo1.de5.net)
  ↓ (代理)
Google AI API (generativelanguage.googleapis.com)
```

---

## 优势

1. **无需公网 IP**：服务器可以是内网，只要能访问外网
2. **HTTPS 支持**：Worker 提供免费的 HTTPS
3. **全球 CDN**：Worker 部署在全球边缘节点
4. **免费额度**：每天 100,000 次请求
5. **统一入口**：一个 Worker 处理多种代理需求

---

## 验证步骤

### 1. 测试 Worker 是否正常工作

在浏览器访问：
```
https://nano.mygogogo1.de5.net/api/vidu-callback
```

应该看到你的服务器的响应（可能是 405 Method Not Allowed，因为需要 POST）

### 2. 测试回调 URL

检查服务器日志，创建一个 VIDU 任务后，应该看到：
```
[VIDU:xxxxx] Callback URL: https://nano.mygogogo1.de5.net/api/vidu-callback
```

### 3. 验证回调接收

当 VIDU 任务完成时，你应该在服务器日志中看到：
```
[VIDU-CALLBACK:xxxxx] ========== TASK CALLBACK RECEIVED ==========
[VIDU-CALLBACK:xxxxx] Task ID: 914312635665629184
[VIDU-CALLBACK:xxxxx] State: success
```

---

## 故障排查

### 问题 1：回调没有被接收

**检查**：
1. Worker 是否已更新并部署？
2. Worker 日志中是否有回调请求？
3. 服务器防火墙是否允许来自 Worker 的请求？

### 问题 2：服务器收到回调但状态不对

**检查**：
1. 查看服务器日志中的完整回调内容
2. 确认 VIDU API 返回的任务状态

### 问题 3：Worker 返回错误

**检查**：
1. Worker 代码是否正确复制
2. 环境变量是否配置正确
3. 查看 Worker 的实时日志

---

## 部署命令

```bash
# 1. 拉取最新代码
cd ~/node-banana
git pull

# 2. 确认 .env 配置
cat .env | grep CLOUDFLARE_WORKER

# 3. 重启服务
docker-compose down
docker-compose up -d --build

# 4. 查看日志
docker-compose logs -f app
```

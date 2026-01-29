# Cloudflare Worker 设置 - Google AI 代理 + VIDU 回调转发

## 功能说明

这个 Cloudflare Worker 同时支持：
1. **Google AI API 代理**：转发 Gemini API 请求
2. **VIDU 回调转发**：接收 VIDU 回调并转发到你的服务器
3. **健康检查端点**：`/health` - 检查服务器连通性

**新增功能**：
- 环境变量配置服务器地址
- 自动重试机制（最多 3 次）
- 详细的错误日志

---

## 第一步：更新 Cloudflare Worker 代码

1. 登录 [Cloudflare Dashboard](https://dash.cloudflare.com/)
2. 进入 **Workers & Pages**
3. 选择现有的 Worker `nano.mygogogo1.de5.net`
4. **编辑 Worker 代码**，替换为 `cloudflare-worker-vidu-callback.js` 的内容
5. **保存并部署**

---

## 第二步：配置 Worker 环境变量

在 Worker 设置中添加环境变量：

### 必需的环境变量

| 变量名 | 值 | 说明 |
|--------|-----|------|
| `GOOGLE_API_KEY` | 你的 Google Cloud API Key | 用于 Google AI API 代理 |
| `VIDU_SERVER_URL` | `http://101.126.147.111:3012` | 你的服务器地址（用于 VIDU 回调转发） |

### 配置步骤

1. 在 Worker 页面，点击 **Settings** → **Variables and Secrets**
2. 点击 **Add variable** 添加上述两个环境变量
3. 点击 **Save and deploy**
4. 重新部署 Worker 使环境变量生效

---

## 第三步：更新服务器环境变量

在服务器的 `.env` 文件中确认以下配置：

```bash
# Cloudflare Worker URL（用于 Google AI 代理和 VIDU 回调）
CLOUDFLARE_WORKER_URL=https://nano.mygogogo1.de5.net

# VIDU API 配置
VIDU_API_KEY=YOUR_VIDU_API_KEY
VIDU_API_BASE_URL=https://api.vidu.cn/ent/v2

# 可选：强制轮询模式（如果回调不工作，设置为 true）
# FORCE_VIDU_POLLING=true
```

---

## 工作原理

### VIDU 回调流程：

```
VIDU 服务器
  ↓ (回调请求)
Cloudflare Worker (nano.mygogogo1.de5.net/api/vidu-callback)
  ↓ (转发请求，带重试)
你的服务器 (101.126.147.111:3012/api/vidu-callback)
  ↓ (存储到内存缓存)
前端轮询 /api/vidu-task/[taskId]
  ↓ (获取结果)
前端显示生成结果
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

1. **无需公网域名**：服务器使用 IP 即可，无需配置域名
2. **HTTPS 支持**：Worker 提供免费的 HTTPS
3. **全球 CDN**：Worker 部署在全球边缘节点
4. **自动重试**：网络临时故障时自动重试（指数退避）
5. **统一入口**：一个 Worker 处理多种代理需求
6. **健康检查**：实时监控服务器连通性

---

## 验证步骤

### 1. 测试 Worker 健康检查

```bash
curl https://nano.mygogogo1.de5.net/health
```

**期望输出**：
```json
{
  "status": "ok",
  "server": "reachable"
}
```

### 2. 测试回调转发

```bash
curl -X POST https://nano.mygogogo1.de5.net/api/vidu-callback \
  -H "Content-Type: application/json" \
  -d '{
    "id": "test-123",
    "state": "success",
    "creations": [{"url": "https://example.com/image.png"}],
    "model": "viduq2",
    "resolution": "1080p"
  }'
```

**期望输出**：
- Worker 返回 200
- 服务器日志显示 `[VIDU-CALLBACK:xxx] ========== TASK CALLBACK RECEIVED ==========`

### 3. 测试回调 URL 配置

检查服务器日志，创建一个 VIDU 任务后，应该看到：
```
[VIDU:xxxxx] Callback URL: https://nano.mygogogo1.de5.net/api/vidu-callback
```

### 4. 端到端测试

1. 在前端创建 VIDU 生成任务
2. 等待任务完成（约 30-60 秒）
3. 观察服务器日志收到回调：
   ```
   [VIDU-CALLBACK:xxxxx] State: success
   ```
4. 前端自动获取并显示结果

---

## 故障排查

### 问题 1：Worker 健康检查返回 error

**症状**：
```json
{
  "status": "error",
  "error": "..."
}
```

**可能原因**：
- 服务器未启动
- 服务器地址配置错误
- 服务器防火墙阻止了 Worker 的请求

**解决方法**：
```bash
# 检查服务器是否运行
docker-compose ps

# 检查服务器端口是否开放
netstat -tlnp | grep 3012

# 检查防火墙规则
iptables -L -n | grep 3012

# 测试服务器健康检查端点
curl http://101.126.147.111:3012/api/health
```

### 问题 2：回调没有被接收

**检查步骤**：
1. **验证 Worker 环境变量**：
   - 登录 Cloudflare Dashboard
   - 检查 `VIDU_SERVER_URL` 是否正确配置
   - 重新部署 Worker

2. **查看 Worker 日志**：
   - 在 Cloudflare Dashboard → Worker → Logs
   - 搜索 "Forwarding VIDU callback"
   - 查看是否有错误信息

3. **检查服务器防火墙**：
   ```bash
   # 添加 Cloudflare IP 段到白名单
   iptables -A INPUT -s 173.245.48.0/20 -j ACCEPT
   iptables -A INPUT -s 103.21.244.0/22 -j ACCEPT
   # ... 更多 Cloudflare IP 段
   ```

### 问题 3：服务器收到回调但状态不对

**检查**：
1. 查看服务器日志中的完整回调内容
2. 确认 VIDU API 返回的任务状态
3. 检查内存缓存是否因重启被清空

**解决方法**：
- 启用 `FORCE_VIDU_POLLING=true` 作为备用
- 考虑使用 Redis 替代内存缓存

### 问题 4：Worker 返回 502 Bad Gateway

**症状**：回调转发失败

**可能原因**：
- 服务器暂时不可用
- 网络连接问题

**解决方法**：
- Worker 会自动重试 3 次
- 检查服务器日志
- 查看 Worker 实时日志确认重试情况

---

## Worker 日志查看

### 实时日志

1. 登录 Cloudflare Dashboard
2. 进入 Workers & Pages
3. 选择 Worker
4. 点击 **Logs** 标签
5. 查看实时请求日志

### 日志示例

**成功的回调**：
```
Worker request: POST /api/vidu-callback
Forwarding VIDU callback to server
Target URL: http://101.126.147.111:3012/api/vidu-callback
Attempt 1/3 succeeded
VIDU callback forwarded successfully
```

**重试情况**：
```
Worker request: POST /api/vidu-callback
Forwarding VIDU callback to server
Target URL: http://101.126.147.111:3012/api/vidu-callback
Attempt 1/3 failed with status 503
Retrying after 1000ms...
Attempt 2/3 succeeded
VIDU callback forwarded successfully
```

---

## 部署命令

```bash
# 1. 拉取最新代码
cd ~/node-banana
git pull

# 2. 确认 .env 配置
cat .env | grep CLOUDFLARE_WORKER
cat .env | grep VIDU_API_KEY

# 3. 重启服务
docker-compose down
docker-compose up -d --build

# 4. 查看日志
docker-compose logs -f app | grep VIDU

# 5. 测试健康检查
curl https://nano.mygogogo1.de5.net/health
```

---

## 回滚方案

如果 Worker 回调方案遇到问题，可以快速切换到轮询模式：

```bash
# 在服务器 .env 文件中添加
echo "FORCE_VIDU_POLLING=true" >> .env

# 重启服务
docker-compose restart app

# 查看日志确认
docker-compose logs -f app | grep POLLING
```

这样即使回调失败，系统仍可正常运行。

---

## 后续优化建议

### 短期（1 周内）

1. **监控告警**
   - 配置 Cloudflare Analytics 查看请求统计
   - 设置回调失败告警

2. **安全加固**
   - 添加回调签名验证
   - 限制 VIDU API Key 的使用范围

### 中期（1 月内）

1. **高可用性**
   - 支持多个服务器实例
   - Worker 实现负载均衡转发

2. **可观测性**
   - 集成 Sentry 错误追踪
   - 添加 Prometheus 指标

### 长期（3 月内）

1. **架构升级**
   - 使用 Redis 替代内存缓存
   - 引入消息队列解耦回调处理


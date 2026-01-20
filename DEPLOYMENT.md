# Node Banana - Docker 部署指南

## 前置要求

- Docker 20.10+
- Docker Compose 2.0+
- 服务器至少 2GB RAM
- 至少 10GB 可用磁盘空间

## 快速开始

### 1. 克隆代码

```bash
git clone https://github.com/tatookan/node-banana.git
cd node-banana
```

### 2. 配置环境变量

```bash
# 复制环境变量模板
cp .env.production.example .env

# 编辑配置文件，填入你的实际值
nano .env
```

**必须配置的变量**：
- `MYSQL_ROOT_PASSWORD` - MySQL root 密码
- `DB_PASSWORD` - 数据库用户密码
- `JWT_SECRET` - JWT 密钥（随机生成，至少 32 字符）
- `GOOGLE_CLOUD_API_KEY` - Google Cloud API 密钥
- `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` - R2 凭证
- `R2_BUCKET_NAME` - R2 bucket 名称

### 3. 启动服务

```bash
# 构建并启动
docker-compose up -d --build

# 查看日志
docker-compose logs -f
```

### 4. 初始化数据库

服务启动后，数据库表会自动创建。然后创建邀请码：

```bash
# 进入 MySQL 容器
docker-compose exec mysql mysql -u node_banana -p node_banana

# 在 MySQL 中执行
INSERT INTO invite_codes (code, is_used) VALUES ('YOUR_INVITE_CODE', FALSE);
```

### 5. 访问应用

```
http://your-server-ip:3000
```

---

## 常用操作

### 更新应用

```bash
# 1. 拉取最新代码
git pull

# 2. 重新构建并启动
docker-compose up -d --build

# 3. 查看状态
docker-compose ps
```

### 查看日志

```bash
# 所有服务
docker-compose logs -f

# 只看应用
docker-compose logs -f app

# 只看数据库
docker-compose logs -f mysql
```

### 停止服务

```bash
docker-compose down
```

### 停止并删除数据（⚠️ 危险）

```bash
docker-compose down -v
```

### 数据库备份

```bash
# 备份
docker-compose exec mysql mysqldump -u root -p node_banana > backup_$(date +%Y%m%d).sql

# 恢复
docker-compose exec -T mysql mysql -u root -p node_banana < backup_20250118.sql
```

---

## 启用 HTTPS（可选）

### 1. 准备 SSL 证书

将证书文件放到 `docker/nginx/ssl/` 目录：
```
docker/nginx/ssl/cert.pem
docker/nginx/ssl/key.pem
```

### 2. 修改 docker-compose.yml

取消 nginx 服务的注释：
```yaml
# nginx:
#   image: nginx:alpine
#   ...
```

### 3. 重启服务

```bash
docker-compose up -d --build
```

---

## 数据持久化

以下数据会持久化到宿主机：

| 数据 | 宿主机路径 | 说明 |
|------|-----------|------|
| MySQL 数据 | Docker volume `mysql-data` | 数据库所有数据 |
| R2 图片 | Cloudflare R2 | 不在本地 |

---

## 已知问题

### Docker Compose 1.29.2 兼容性问题

#### 问题描述
使用旧版本的 Docker Compose (1.29.2) 时，在更新部署时可能会遇到以下错误：

```
ERROR: for app  'ContainerConfig'
KeyError: 'ContainerConfig'
docker.errors.ImageNotFound: 404 Client Error
No such image: sha256:...
```

#### 原因
Docker Compose 1.29.2 (2021年发布) 与新版 Docker API 存在兼容性问题。当尝试重新创建容器时，旧版本无法正确处理新版 Docker 返回的镜像配置信息。

#### 解决方案

**方案 1: 清理孤立容器（推荐）**
```bash
# 删除所有停止的容器和孤立的容器
docker-compose down --remove-orphans

# 重新构建并启动
docker-compose up -d --build
```

**方案 2: 强制清理重建**
```bash
# 停止所有服务
docker-compose stop

# 删除所有容器（不会删除 volume 数据）
docker-compose rm -f

# 重新构建并启动
docker-compose up -d --build
```

**方案 3: 手动删除应用容器**
```bash
# 只删除应用容器，不删除数据库容器
docker rm -f node-banana-app

# 重新启动
docker-compose up -d
```

#### 长期解决方案：升级 Docker Compose

```bash
# 下载最新版本的 docker-compose
sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose

# 添加执行权限
sudo chmod +x /usr/local/bin/docker-compose

# 验证版本
docker-compose --version
```

**注意**: 升级 docker-compose 不会影响其他运行中的容器，只是工具本身的更新。

#### 重要提示

⚠️ **数据安全**:
- `node-banana-app` 容器可以安全删除和重建
- `node-banana-mysql` 容器包含数据库数据，**不要轻易删除**
- 数据存储在 Docker volume (`mysql-data`) 中，与容器分离

⚠️ **危险命令（会删除数据）**:
```bash
# 不要使用这些命令，除非你确定要清空所有数据
docker-compose down -v  # -v 参数会删除 volumes
docker volume rm node-banana_mysql-data  # 直接删除数据卷
```

---

## 故障排查

### 端口冲突

如果 3000 端口被占用，修改 `.env` 文件：
```
APP_PORT=3001
```

### 数据库连接失败

检查 MySQL 是否健康：
```bash
docker-compose ps
docker-compose logs mysql
```

### 应用无法启动

查看详细日志：
```bash
docker-compose logs app
```

### 重新构建

如果出现缓存问题：
```bash
docker-compose down
docker-compose build --no-cache
docker-compose up -d
```

---

## 生产环境建议

1. **修改默认密码**：`.env` 中所有密码都必须修改
2. **启用 HTTPS**：使用 SSL 证书保护通信
3. **定期备份**：设置定时任务备份数据库
4. **监控日志**：使用 `docker-compose logs -f` 监控运行状态
5. **防火墙配置**：只开放必要端口（80/443）

---

## 目录结构

```
node-banana/
├── docker/
│   └── nginx/
│       ├── nginx.conf      # Nginx 配置
│       └── ssl/            # SSL 证书目录
├── Dockerfile              # 应用镜像构建文件
├── docker-compose.yml      # 服务编排配置
├── .dockerignore          # Docker 构建忽略文件
├── .env.production.example # 环境变量模板
└── DEPLOYMENT.md          # 本文档
```

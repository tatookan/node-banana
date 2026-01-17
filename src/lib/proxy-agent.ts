// Proxy configuration for @google/genai SDK
// 将 Google API 请求通过 Cloudflare Worker 代理

import { HttpsProxyAgent } from "https-proxy-agent";

// Cloudflare Worker 代理 URL
const PROXY_URL = process.env.CLOUDFLARE_WORKER_URL || "";

// 创建代理 Agent
export const proxyAgent = PROXY_URL
  ? new HttpsProxyAgent(PROXY_URL)
  : undefined;

// Google API 基础 URL（通过代理重写）
export const GOOGLE_API_BASE_URL = process.env.CLOUDFLARE_WORKER_URL
  ? process.env.CLOUDFLARE_WORKER_URL
  : "https://generativelanguage.googleapis.com";

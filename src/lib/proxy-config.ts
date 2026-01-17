// 配置全局代理 - 在应用启动时加载
import { setGlobalDispatcher, ProxyAgent } from 'undici';

const proxyUrl = process.env.HTTP_PROXY || process.env.HTTPS_PROXY;

if (proxyUrl) {
  console.log(`[Proxy] Configuring global proxy: ${proxyUrl}`);
  try {
    setGlobalDispatcher(new ProxyAgent(proxyUrl));
    console.log('[Proxy] ✓ Global proxy configured successfully');
  } catch (error) {
    console.error('[Proxy] ✗ Failed to configure proxy:', error);
  }
} else {
  console.log('[Proxy] No proxy configured (HTTP_PROXY/HTTPS_PROXY not set)');
}

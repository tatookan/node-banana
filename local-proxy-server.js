// 本地代理服务器 - 将 Node.js 请求转发到 Cloudflare Worker
// 这样 @google/genai SDK 可以通过 Cloudflare Worker 访问 Google API

const http = require('http');
const https = require('https');
const url = require('url');

const CLOUDFLARE_WORKER = process.env.CLOUDFLARE_WORKER_URL || 'https://nano.mygogogo1.de5.net';
const PROXY_PORT = 8080;

console.log(`Starting local proxy server on port ${PROXY_PORT}`);
console.log(`Forwarding requests to Cloudflare Worker: ${CLOUDFLARE_WORKER}`);

const server = http.createServer((req, res) => {
  // 添加 CORS 头
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  // 获取请求数据
  let body = '';
  req.on('data', chunk => {
    body += chunk.toString();
  });

  req.on('end', () => {
    // 转发请求到 Cloudflare Worker
    const options = {
      method: req.method,
      headers: {
        ...req.headers,
        host: new URL(CLOUDFLARE_WORKER).host,
      },
      body: body || undefined,
    };

    fetch(CLOUDFLARE_WORKER, options)
      .then(response => {
        // 复制响应头
        Object.keys(response.headers).forEach(key => {
          if (key.toLowerCase() !== 'transfer-encoding') {
            res.setHeader(key, response.headers.get(key));
          }
        });

        res.writeHead(response.status);
        return response.arrayBuffer();
      })
      .then(buffer => {
        res.end(Buffer.from(buffer));
      })
      .catch(error => {
        console.error('Proxy error:', error);
        res.writeHead(500);
        res.end(JSON.stringify({ error: 'Proxy error', message: error.message }));
      });
  });
});

server.listen(PROXY_PORT, () => {
  console.log(`Proxy server running on http://localhost:${PROXY_PORT}`);
  console.log('Configure Node.js to use this proxy:');
  console.log(`  export HTTP_PROXY=http://localhost:${PROXY_PORT}`);
  console.log(`  export HTTPS_PROXY=http://localhost:${PROXY_PORT}`);
});

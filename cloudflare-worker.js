// Cloudflare Worker for Google Vertex AI API Proxy
// Transparent proxy for @google/genai SDK with Vertex AI mode

export default {
  async fetch(request, env, ctx) {
    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-goog-api-key',
        },
      });
    }

    try {
      // Get the original URL
      const url = new URL(request.url);

      // Target Vertex AI endpoint
      const projectId = 'xinshujue-ai';
      const location = 'us-central1';
      const vertexAIHost = `${location}-aiplatform.googleapis.com`;

      // Reconstruct the target URL
      // The SDK calls: https://{location}-aiplatform.googleapis.com/v1/projects/{projectId}/...
      const targetUrl = new URL(url.pathname + url.search, `https://${vertexAIHost}`);

      console.log(`[Worker] Proxying: ${request.method} ${targetUrl.href}`);

      // Build proxy request
      const proxyRequest = new Request(targetUrl, {
        method: request.method,
        headers: request.headers,
        body: request.body,
      });

      // Add API key header if not present
      if (env.GOOGLE_API_KEY && !proxyRequest.headers.has('x-goog-api-key')) {
        proxyRequest.headers.set('x-goog-api-key', env.GOOGLE_API_KEY);
      }

      // Send request to Vertex AI
      const response = await fetch(proxyRequest);

      console.log(`[Worker] Response status: ${response.status}`);

      // Return response with CORS headers
      const responseBody = await response.text();

      return new Response(responseBody, {
        status: response.status,
        statusText: response.statusText,
        headers: {
          ...Object.fromEntries(response.headers.entries()),
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-goog-api-key',
        },
      });

    } catch (error) {
      console.error('[Worker] Error:', error);
      return new Response(
        JSON.stringify({ error: 'Proxy error', message: error.message }),
        {
          status: 500,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          }
        }
      );
    }
  },
};

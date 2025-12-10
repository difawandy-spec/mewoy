import axios from 'axios';
import express from 'express';
import { HttpProxyAgent } from 'http-proxy-agent';
import { HttpsProxyAgent } from 'https-proxy-agent';
import url from 'url';

const app = express();
const PORT = process.env.PORT || 3000;

// Configuration dari environment variables
const PROXY_URL = process.env.PROXY_URL || 'http://efhjfxos:fqzez23px4o5@45.39.73.12:5427';
const TARGET_HOST = process.env.TARGET_HOST || 'mwmpos01.akamaized.net';
const REFERER_URL = process.env.REFERER_URL || 'https://www.mewatch.sg/';

// Setup proxy agents
const httpAgent = new HttpProxyAgent(PROXY_URL);
const httpsAgent = new HttpsProxyAgent(PROXY_URL);

console.log('🚀 Media Proxy Server Starting...');
console.log(`📍 Target Host: ${TARGET_HOST}`);
console.log(`🔗 Proxy: ${PROXY_URL.replace(/:[^:]*@/, ':***@')}`); // Hide password in logs

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Main proxy handler
app.all('*', async (req, res) => {
  try {
    // Konstruksi target URL
    const path = req.path;
    const query = new url.URLSearchParams(req.query).toString();
    const targetUrl = `https://${TARGET_HOST}${path}${query ? '?' + query : ''}`;

    console.log(`📨 ${req.method} ${req.path}`);

    // Prepare request headers
    const headers = {
      ...req.headers,
      'Referer': REFERER_URL,
      'User-Agent': req.headers['user-agent'] || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    };

    // Remove host header untuk avoid conflicts
    delete headers.host;

    // Prepare request body
    let data = undefined;
    if (['POST', 'PUT', 'PATCH'].includes(req.method)) {
      data = await getRawBody(req);
    }

    // Make request dengan proxy
    const response = await axios({
      method: req.method.toLowerCase(),
      url: targetUrl,
      headers: headers,
      data: data,
      httpAgent: httpAgent,
      httpsAgent: httpsAgent,
      responseType: 'stream',
      maxRedirects: 5,
      timeout: 30000,
      validateStatus: () => true, // Accept all status codes
    });

    // Set response headers
    res.status(response.status);
    
    // Copy headers dari response, skip problematic ones
    Object.keys(response.headers).forEach(key => {
      const skipHeaders = ['content-encoding', 'transfer-encoding'];
      if (!skipHeaders.includes(key.toLowerCase())) {
        res.set(key, response.headers[key]);
      }
    });

    // Add CORS headers
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, PATCH, DELETE');
    res.set('Access-Control-Allow-Headers', '*');

    // Handle OPTIONS requests
    if (req.method === 'OPTIONS') {
      return res.status(200).end();
    }

    // Pipe response body
    response.data.pipe(res);

  } catch (error) {
    console.error('❌ Error:', error.message);

    // Return error response
    res.status(error.response?.status || 502).json({
      error: 'Proxy Error',
      message: error.message,
      timestamp: new Date().toISOString(),
    });
  }
});

// Helper function untuk get raw body dari request
function getRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('🔴 Unhandled Error:', err);
  res.status(500).json({
    error: 'Internal Server Error',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong',
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`✅ Server running on http://localhost:${PORT}`);
  console.log(`📊 Health check: http://localhost:${PORT}/health`);
  console.log(`🔄 Ready to proxy requests to ${TARGET_HOST}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('⛔ SIGTERM received, shutting down gracefully...');
  process.exit(0);
});
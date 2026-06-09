const http = require('http');
const fs = require('fs');
const path = require('path');

const root = __dirname;
const port = Number(process.env.PORT || 8765);
const baseUrl = process.env.SENSEAUDIO_BASE_URL || 'https://api.senseaudio.cn';
const model = process.env.SENSEAUDIO_MODEL || 'senseaudio-s2';
const apiKey = process.env.SENSEAUDIO_API_KEY;

const mime = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml; charset=utf-8',
  '.ico': 'image/x-icon'
};

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 1024 * 1024) {
        req.destroy();
        reject(new Error('Request body too large'));
      }
    });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

function corsHeaders(extra = {}) {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    ...extra
  };
}

function sendJson(res, status, data) {
  res.writeHead(status, corsHeaders({ 'Content-Type': 'application/json; charset=utf-8' }));
  res.end(JSON.stringify(data));
}

function safeJson(text) {
  const trimmed = String(text || '').trim();
  try { return JSON.parse(trimmed); } catch (_) {}
  const match = trimmed.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try { return JSON.parse(match[0]); } catch (_) { return null; }
}

async function handleAiMatch(req, res) {
  if (!apiKey || apiKey === 'https://api.senseaudio.cn') {
    sendJson(res, 500, { error: 'Missing SENSEAUDIO_API_KEY. Set it on the server; do not put it in index.html.' });
    return;
  }

  const payload = JSON.parse(await readBody(req) || '{}');
  const query = String(payload.query || '').trim();
  let listings = Array.isArray(payload.listings) ? payload.listings : [];
  if (listings.length === 0) {
    try { listings = JSON.parse(fs.readFileSync(require('path').join(root, 'data', 'properties.json'), 'utf8')); } catch (_) { listings = []; }
  }
  if (!query) {
    sendJson(res, 400, { error: 'query is required' });
    return;
  }

  const systemPrompt = [
    '\u4f60\u662f\u5c0f\u90b1AI\u52a9\u624b\uff0c\u53ea\u80fd\u6839\u636e\u4f20\u5165\u7684listings\u623f\u6e90\u6570\u636e\u56de\u7b54\uff0c\u4e25\u7981\u7f16\u9020\u4e0d\u5b58\u5728\u7684\u5c0f\u533a\u3001\u697c\u5c42\u3001\u671d\u5411\u3001\u88c5\u4fee\u3001\u5468\u8fb9\u6216\u4ea4\u901a\u3002',
    '\u53ea\u8fd4\u56deJSON\uff0c\u4e0d\u8981Markdown\u3002',
    'JSON\u683c\u5f0f\uff1a{"filters":{"community":"","rooms":"","halls":"","bathrooms":"","areaRange":"","floor":"","direction":"","decoration":"","yearRange":"","surroundings":[]},"reply":""}\u3002',
    'filters\u5b57\u6bb5\u5fc5\u987b\u4f7f\u7528\u7f51\u7ad9\u73b0\u6709\u9009\u9879\u503c\uff1b\u65e0\u6cd5\u5224\u65ad\u5219\u586b\u7a7a\u5b57\u7b26\u4e32\u6216\u7a7a\u6570\u7ec4\u3002',
    'areaRange\u53ea\u80fd\u662f"100-200\u5e73"\u6216"200-300\u5e73"\u6216\u7a7a\u3002floor\u53ea\u80fd\u662f"\u4f4e\u5c42"\u3001"\u4e2d\u5c42"\u3001"\u9ad8\u5c42"\u6216\u7a7a\u3002',
    'direction\u53ea\u80fd\u662f"\u5357"\u3001"\u5317"\u6216\u7a7a\u3002decoration\u53ea\u80fd\u662f"\u7cbe\u88c5"\u3001"\u7b80\u88c5"\u6216\u7a7a\u3002',
    'yearRange\u53ea\u80fd\u662f"2005-2010"\u3001"2010-2015"\u3001"2015-2020"\u3001"2020-2025"\u6216\u7a7a\u3002surroundings\u53ea\u80fd\u5305\u542b"\u5b66\u6821"\u3001"\u533b\u9662"\u3001"\u516c\u56ed"\u3002',
    'reply\u5fc5\u987b\u57fa\u4e8e\u5339\u914d\u5230\u7684listings\uff0c\u70b9\u540d\u63a8\u8350\u771f\u5b9e\u5c0f\u533a\u540d\u548c\u771f\u5b9e\u5b57\u6bb5\uff1b\u5982\u679c\u6ca1\u6709\u5339\u914d\uff0c\u8bf4\u660e\u5efa\u8bae\u653e\u5bbd\u6761\u4ef6\u3002'
  ].join('\n');

  const upstream = await fetch(`${baseUrl.replace(/\/$/, '')}/v1/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: JSON.stringify({ query, listings }, null, 2) }
      ]
    })
  });

  const text = await upstream.text();
  if (!upstream.ok) {
    sendJson(res, upstream.status, { error: 'AI API request failed', detail: text.slice(0, 1000) });
    return;
  }

  const raw = safeJson(text);
  const content = raw?.choices?.[0]?.message?.content || raw?.output_text || text;
  const parsed = safeJson(content);
  if (!parsed || !parsed.filters) {
    sendJson(res, 502, { error: 'AI response is not valid match JSON', detail: String(content).slice(0, 1000) });
    return;
  }

  sendJson(res, 200, parsed);
}

function serveStatic(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  let pathname = decodeURIComponent(url.pathname);
  if (pathname === '/') pathname = '/index.html';
  const file = path.normalize(path.join(root, pathname));
  if (!file.startsWith(root)) {
    res.writeHead(403, corsHeaders());
    res.end('Forbidden');
    return;
  }
  fs.readFile(file, (err, data) => {
    if (err) {
      res.writeHead(404, corsHeaders());
      res.end('Not found');
      return;
    }
    res.writeHead(200, corsHeaders({ 'Content-Type': mime[path.extname(file).toLowerCase()] || 'application/octet-stream' }));
    res.end(data);
  });
}

const server = http.createServer((req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, corsHeaders());
    res.end();
    return;
  }
  if (req.method === 'POST' && req.url === '/api/ai-match') {
    handleAiMatch(req, res).catch(err => sendJson(res, 500, { error: err.message }));
    return;
  }
  if (req.method === 'GET' || req.method === 'HEAD') {
    serveStatic(req, res);
    return;
  }
  res.writeHead(405, corsHeaders());
  res.end('Method not allowed');
});

server.listen(port, () => {
  console.log(`Property filter web running at http://127.0.0.1:${port}`);
});

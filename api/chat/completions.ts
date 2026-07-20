import type { IncomingMessage, ServerResponse } from 'http';

export default async function handler(
  request: IncomingMessage,
  response: ServerResponse,
) {
  response.setHeader('Access-Control-Allow-Origin', '*');
  response.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (request.method === 'OPTIONS') {
    response.statusCode = 200;
    return response.end();
  }

  response.setHeader('Content-Type', 'application/json');

  if (request.method !== 'POST') {
    response.statusCode = 405;
    return response.end(JSON.stringify({ error: 'Method not allowed' }));
  }

  const targetBase = process.env.VITE_LLM_PROXY_TARGET || 'https://opencode.ai/zen/go/v1';
  const targetUrl = `${targetBase.replace(/\/+$/, '')}/chat/completions`;

  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(chunk as Buffer);
  }

  try {
    const apiResponse = await fetch(targetUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: request.headers.authorization || '',
      },
      body: Buffer.concat(chunks).toString(),
    });
    const data = await apiResponse.json();
    response.statusCode = apiResponse.status;
    return response.end(JSON.stringify(data));
  } catch (error) {
    console.error('[Proxy] Error:', error);
    response.statusCode = 500;
    return response.end(JSON.stringify({ error: 'Internal server error' }));
  }
}

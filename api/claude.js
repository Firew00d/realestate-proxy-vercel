/**
 * Anthropic API 프록시 (Vercel Serverless Function)
 * ------------------------------------------------------
 * - 브라우저 → 이 함수 → Anthropic API로 전달
 * - API 키는 Vercel 환경변수(ANTHROPIC_API_KEY)에서 읽어 노출되지 않음
 * - 미국 iad1 리전에서 실행되어 Anthropic의 지역 차단 회피
 * - POST 요청만 허용, 요청 body를 그대로 Anthropic에 전달
 */

export const config = {
  runtime: 'edge',            // Edge Runtime 사용 → 빠른 콜드스타트
  regions: ['iad1'],          // Washington D.C. (미국 동부)
};

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, x-api-key, anthropic-version',
  'Access-Control-Max-Age': '86400',
};

export default async function handler(request) {
  // Preflight
  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: CORS_HEADERS });
  }

  if (request.method !== 'POST') {
    return json({ error: 'POST required' }, 405);
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return json({
      error: 'ANTHROPIC_API_KEY 환경변수가 설정되지 않았습니다. Vercel 대시보드에서 등록하세요.'
    }, 500);
  }

  let body;
  try {
    body = await request.text();
  } catch (e) {
    return json({ error: 'Invalid request body' }, 400);
  }

  const bodySizeKB = (body.length / 1024).toFixed(1);
  console.log(`[claude] Request size: ${bodySizeKB} KB`);

  try {
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body,
    });

    const text = await resp.text();
    if (!resp.ok) {
      const preview = text.slice(0, 500) || '(empty body)';
      console.error(`[claude] Anthropic ERROR status=${resp.status} body=${preview}`);
    }

    return new Response(text, {
      status: resp.status,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        ...CORS_HEADERS,
      },
    });
  } catch (e) {
    console.error('[claude] Upstream error:', e);
    return json({ error: `Upstream error: ${String(e)}` }, 502);
  }
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj, null, 2), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...CORS_HEADERS },
  });
}

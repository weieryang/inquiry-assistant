const { readKnowledgeData, writeKnowledgeProfile } = require('./_knowledgeStore');

const DEFAULT_ALLOWED_ORIGINS = [
    'https://xunpanhuifu.netlify.app',
    'http://localhost:3000',
    'http://localhost:8888'
];

function getAllowedOrigins() {
    const configured = process.env.ALLOWED_ORIGINS;
    if (!configured) return DEFAULT_ALLOWED_ORIGINS;
    return configured.split(',').map(item => item.trim()).filter(Boolean);
}

function getHeader(headers = {}, name) {
    const target = name.toLowerCase();
    const key = Object.keys(headers).find(item => item.toLowerCase() === target);
    return key ? headers[key] : '';
}

function buildHeaders(event) {
    const origin = getHeader(event.headers, 'origin');
    const allowedOrigins = getAllowedOrigins();
    const allowAny = allowedOrigins.includes('*');
    const allowOrigin = allowAny || allowedOrigins.includes(origin)
        ? (origin || allowedOrigins[0] || '*')
        : allowedOrigins[0];

    return {
        'Access-Control-Allow-Origin': allowOrigin,
        'Access-Control-Allow-Methods': 'GET, PUT, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-App-Token',
        'Access-Control-Max-Age': '86400',
        'Vary': 'Origin',
        'Content-Type': 'application/json'
    };
}

function json(statusCode, headers, body) {
    return { statusCode, headers, body: JSON.stringify(body) };
}

function validateOrigin(event) {
    const origin = getHeader(event.headers, 'origin');
    if (!origin) return true;
    const allowedOrigins = getAllowedOrigins();
    return allowedOrigins.includes('*') || allowedOrigins.includes(origin);
}

function validateAccessToken(event) {
    const requiredToken = process.env.APP_ACCESS_TOKEN;
    if (!requiredToken) return true;

    const appToken = getHeader(event.headers, 'x-app-token');
    const auth = getHeader(event.headers, 'authorization');
    const bearerToken = auth.toLowerCase().startsWith('bearer ') ? auth.slice(7).trim() : '';

    return appToken === requiredToken || bearerToken === requiredToken;
}

function parseBody(event) {
    if (!event.body) return {};
    const rawBody = event.isBase64Encoded
        ? Buffer.from(event.body, 'base64').toString('utf8')
        : event.body;
    return JSON.parse(rawBody);
}

exports.handler = async (event) => {
    const headers = buildHeaders(event);

    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers, body: '' };
    }

    if (!validateOrigin(event)) {
        return json(403, headers, { error: 'Origin not allowed' });
    }

    if (!validateAccessToken(event)) {
        return json(401, headers, { error: 'Access token required' });
    }

    try {
        if (event.httpMethod === 'GET') {
            const data = await readKnowledgeData();
            return json(200, headers, data);
        }

        if (event.httpMethod === 'PUT' || event.httpMethod === 'POST') {
            let payload;
            try {
                payload = parseBody(event);
            } catch (error) {
                return json(400, headers, { error: 'Request body must be valid JSON' });
            }

            const category = String(payload.category || '').trim();
            const content = String(payload.content || '').trim();

            if (!category) {
                return json(400, headers, { error: 'category is required' });
            }

            if (!content || content.length > 24000) {
                return json(400, headers, { error: 'content is required and must be 24000 characters or less' });
            }

            const data = await writeKnowledgeProfile(category, { content });
            return json(200, headers, data);
        }

        return json(405, headers, { error: 'Method not allowed' });
    } catch (error) {
        console.error('Knowledge function failed:', error.message);
        return json(error.statusCode || 500, headers, { error: error.message || 'Knowledge storage failed' });
    }
};

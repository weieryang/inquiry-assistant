const crypto = require('crypto');

const DEFAULT_ALLOWED_ORIGINS = [
    'https://xunpanhuifu.netlify.app',
    'http://localhost:3000',
    'http://localhost:8888'
];

const rateLimitBuckets = new Map();

function getAllowedOrigins() {
    const configured = process.env.ALLOWED_ORIGINS;
    if (!configured) return DEFAULT_ALLOWED_ORIGINS;
    return configured.split(',').map(item => item.trim()).filter(Boolean);
}

function getHeader(headers = {}, name) {
    const target = name.toLowerCase();
    const key = Object.keys(headers).find(item => item.toLowerCase() === target);
    return key ? String(headers[key] || '') : '';
}

function buildHeaders(event, methods) {
    const origin = getHeader(event.headers, 'origin');
    const allowedOrigins = getAllowedOrigins();
    const allowAny = allowedOrigins.includes('*');
    const allowOrigin = allowAny || allowedOrigins.includes(origin)
        ? (origin || allowedOrigins[0] || '*')
        : allowedOrigins[0];

    return {
        'Access-Control-Allow-Origin': allowOrigin,
        'Access-Control-Allow-Methods': methods,
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-App-Token, X-Admin-Token',
        'Access-Control-Max-Age': '86400',
        'Vary': 'Origin',
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store'
    };
}

function validateOrigin(event) {
    const origin = getHeader(event.headers, 'origin');
    if (!origin) return true;
    const allowedOrigins = getAllowedOrigins();
    return allowedOrigins.includes('*') || allowedOrigins.includes(origin);
}

function safeEqual(left, right) {
    const leftBuffer = Buffer.from(String(left || ''));
    const rightBuffer = Buffer.from(String(right || ''));
    return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function suppliedTeamToken(event) {
    const appToken = getHeader(event.headers, 'x-app-token');
    const auth = getHeader(event.headers, 'authorization');
    const bearerToken = auth.toLowerCase().startsWith('bearer ') ? auth.slice(7).trim() : '';
    return appToken || bearerToken;
}

function isHostedRuntime() {
    return process.env.NETLIFY === 'true' || Boolean(process.env.CONTEXT || process.env.DEPLOY_ID);
}

function authorizeTeam(event) {
    const requiredToken = String(process.env.APP_ACCESS_TOKEN || '').trim();
    if (!requiredToken) {
        return isHostedRuntime()
            ? { ok: false, statusCode: 503, error: 'Team access control is not configured' }
            : { ok: true };
    }
    return safeEqual(suppliedTeamToken(event), requiredToken)
        ? { ok: true }
        : { ok: false, statusCode: 401, error: 'Access token required' };
}

function authorizeAdmin(event) {
    const team = authorizeTeam(event);
    if (!team.ok) return team;

    const requiredToken = String(process.env.KNOWLEDGE_ADMIN_TOKEN || '').trim();
    if (!requiredToken) {
        return isHostedRuntime()
            ? { ok: false, statusCode: 503, error: 'Knowledge administrator access is not configured' }
            : { ok: true };
    }

    const suppliedToken = getHeader(event.headers, 'x-admin-token');
    return safeEqual(suppliedToken, requiredToken)
        ? { ok: true }
        : { ok: false, statusCode: 403, error: 'Knowledge administrator token required' };
}

function clientAddress(event) {
    const forwarded = getHeader(event.headers, 'x-forwarded-for');
    return (forwarded.split(',')[0] || getHeader(event.headers, 'client-ip') || 'unknown').trim();
}

function consumeRateLimit(event, bucketName, maxRequests, windowMs) {
    const now = Date.now();
    const key = `${bucketName}:${clientAddress(event)}`;
    const current = rateLimitBuckets.get(key);

    if (!current || current.resetAt <= now) {
        rateLimitBuckets.set(key, { count: 1, resetAt: now + windowMs });
        return { allowed: true, remaining: maxRequests - 1, resetAt: now + windowMs };
    }

    current.count += 1;
    if (current.count > maxRequests) {
        return {
            allowed: false,
            remaining: 0,
            resetAt: current.resetAt,
            retryAfter: Math.max(1, Math.ceil((current.resetAt - now) / 1000))
        };
    }

    if (rateLimitBuckets.size > 1000) {
        for (const [bucketKey, value] of rateLimitBuckets) {
            if (value.resetAt <= now) rateLimitBuckets.delete(bucketKey);
        }
    }

    return { allowed: true, remaining: maxRequests - current.count, resetAt: current.resetAt };
}

module.exports = {
    authorizeAdmin,
    authorizeTeam,
    buildHeaders,
    consumeRateLimit,
    getHeader,
    validateOrigin
};

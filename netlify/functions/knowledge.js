const { readKnowledgeData, writeKnowledgeProfile } = require('./_knowledgeStore');
const {
    authorizeAdmin,
    authorizeTeam,
    buildHeaders,
    consumeRateLimit,
    validateOrigin
} = require('./_security');

function json(statusCode, headers, body) {
    return { statusCode, headers, body: JSON.stringify(body) };
}

function parseBody(event) {
    if (!event.body) return {};
    const rawBody = event.isBase64Encoded
        ? Buffer.from(event.body, 'base64').toString('utf8')
        : event.body;
    return JSON.parse(rawBody);
}

exports.handler = async (event) => {
    const headers = buildHeaders(event, 'GET, PUT, POST, OPTIONS');

    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers, body: '' };
    }

    if (!validateOrigin(event)) {
        return json(403, headers, { error: 'Origin not allowed' });
    }

    const authorization = event.httpMethod === 'GET'
        ? authorizeTeam(event)
        : authorizeAdmin(event);
    if (!authorization.ok) {
        return json(authorization.statusCode, headers, { error: authorization.error });
    }

    const rateLimit = consumeRateLimit(
        event,
        event.httpMethod === 'GET' ? 'knowledge-read' : 'knowledge-write',
        event.httpMethod === 'GET' ? 120 : 20,
        event.httpMethod === 'GET' ? 10 * 60 * 1000 : 60 * 60 * 1000
    );
    if (!rateLimit.allowed) {
        return {
            statusCode: 429,
            headers: { ...headers, 'Retry-After': String(rateLimit.retryAfter) },
            body: JSON.stringify({ error: 'Too many requests. Please try again later.' })
        };
    }

    try {
        if (event.httpMethod === 'GET') {
            const data = await readKnowledgeData(event);
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

            const data = await writeKnowledgeProfile(category, { content }, event);
            return json(200, headers, data);
        }

        return json(405, headers, { error: 'Method not allowed' });
    } catch (error) {
        console.error('Knowledge function failed:', error.message);
        return json(error.statusCode || 500, headers, { error: error.message || 'Knowledge storage failed' });
    }
};

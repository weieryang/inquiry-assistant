const https = require('https');

exports.handler = async (event) => {
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type'
    };

    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers, body: '' };
    }

    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
    }

    try {
        const { customerId, inquiry, platform, lang, tone, priceRange, model, knowledgeBase } = JSON.parse(event.body);

        if (!customerId || !inquiry) {
            return { statusCode: 400, headers, body: JSON.stringify({ error: 'Missing customerId or inquiry' }) };
        }

        const API_KEY = process.env.DEEPSEEK_API_KEY;
        if (!API_KEY) {
            return { statusCode: 500, headers, body: JSON.stringify({ error: 'API key not configured' }) };
        }

        const MODEL = model === 'pro' ? 'deepseek-v4-pro' : 'deepseek-v4-flash';

        const langNames = { en: 'English', es: 'Español', ru: 'Русский', ar: 'العربية', pt: 'Português', fr: 'Français', de: 'Deutsch', tr: 'Türkçe' };
        const toneNames = { professional: '专业商务', friendly: '热情友好', concise: '简洁高效' };
        const platformNames = { alibaba: '阿里巴巴国际站', mic: '中国制造网', '1688': '1688批发平台' };

        const systemPrompt = `You are a professional cross-border e-commerce inquiry reply expert for building materials/home products.

Reply in: ${langNames[lang] || 'English'}
Tone: ${toneNames[tone] || 'professional'}
Platform: ${platformNames[platform] || 'Alibaba.com'}

Rules:
- 300-500 words, professional and warm
- Use bullet points for clarity
- End with [Your Name] [Company Name]
${priceRange ? `- Mention reference price range ${priceRange}, confirm final price based on specs` : ''}

Industry: Ceramic tiles, aluminum windows/doors, LED lighting, sanitary ware
Trade terms: FOB/CIF/DDP
Certifications: CE/ISO/SGS

Knowledge base:
${knowledgeBase || '(No specific product info, use general professional reply)'}

Rules:
1. Only reply based on current inquiry and knowledge base
2. Do not fabricate product info
3. Do not leak buyer content`;

        return new Promise((resolve, reject) => {
            const postData = JSON.stringify({
                model: MODEL,
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: inquiry }
                ],
                temperature: 0.7,
                max_tokens: 4096
            });

            const options = {
                hostname: 'api.deepseek.com',
                port: 443,
                path: '/chat/completions',
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${API_KEY}`,
                    'Content-Length': Buffer.byteLength(postData)
                }
            };

            const req = https.request(options, (res) => {
                let data = '';
                res.on('data', (chunk) => { data += chunk; });
                res.on('end', () => {
                    try {
                        const result = JSON.parse(data);
                        if (result.choices && result.choices[0]) {
                            resolve({
                                statusCode: 200,
                                headers,
                                body: JSON.stringify({
                                    reply: result.choices[0].message.content,
                                    model: MODEL,
                                    customerId
                                })
                            });
                        } else {
                            resolve({
                                statusCode: 500,
                                headers,
                                body: JSON.stringify({ error: 'Invalid response from DeepSeek', detail: data.substring(0, 200) })
                            });
                        }
                    } catch (e) {
                        resolve({
                            statusCode: 500,
                            headers,
                            body: JSON.stringify({ error: 'Parse error', detail: data.substring(0, 200) })
                        });
                    }
                });
            });

            req.on('error', (e) => {
                resolve({
                    statusCode: 500,
                    headers,
                    body: JSON.stringify({ error: e.message })
                });
            });

            req.write(postData);
            req.end();
        });
    } catch (err) {
        return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
    }
};
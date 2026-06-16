module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.status(200).end();

    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const { customerId, inquiry, platform, lang, tone, priceRange, model } = req.body;
    if (!customerId || !inquiry) return res.status(400).json({ error: 'Missing customerId or inquiry' });

    const API_KEY = process.env.DEEPSEEK_API_KEY;
    if (!API_KEY) return res.status(500).json({ error: 'API key not configured' });

    const MODEL = model === 'pro' ? 'deepseek-v4-pro' : 'deepseek-v4-flash';

    // Load knowledge base from request header or use default
    const knowledgeBase = req.body.knowledgeBase || '';

    const systemPrompt = buildSystemPrompt(knowledgeBase, platform, lang, tone, priceRange);

    const messages = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: inquiry }
    ];

    try {
        const response = await fetch('https://api.deepseek.com/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${API_KEY}`
            },
            body: JSON.stringify({
                model: MODEL,
                messages: messages,
                temperature: 0.7,
                max_tokens: 4096
            })
        });

        if (!response.ok) {
            const err = await response.text();
            return res.status(500).json({ error: `DeepSeek API error: ${response.status}` });
        }

        const data = await response.json();
        res.json({
            reply: data.choices[0].message.content,
            model: MODEL,
            customerId
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

function buildSystemPrompt(kb, platform, lang, tone, priceRange) {
    const langNames = { en: 'English', es: 'Español', ru: 'Русский', ar: 'العربية', pt: 'Português', fr: 'Français', de: 'Deutsch', tr: 'Türkçe' };
    const toneNames = { professional: '专业商务（正式、严谨）', friendly: '热情友好（亲切、有温度）', concise: '简洁高效（直奔主题）' };
    const platformNames = { alibaba: '阿里巴巴国际站', mic: '中国制造网', '1688': '1688批发平台' };

    return `你是一个专业的跨境电商询盘回复专家，专门为建材/家居品类的卖家服务。

## 回复要求
- 回复语言：${langNames[lang] || 'English'}
- 语气风格：${toneNames[tone] || '专业商务'}
- 平台：${platformNames[platform] || '国际站'}
- 回复控制在300-500字，专业有温度
- 使用列表分点说明，提高可读性
- 末尾加入 [Your Name] [Company Name] 占位符
- 适当给出${priceRange ? '参考价格区间 ' + priceRange + '，' : ''}但注明具体需确认

## 行业知识
- 建材/家居品类专家（瓷砖、门窗、灯具、卫浴）
- 熟悉FOB/CIF/DDP等贸易条款
- 了解CE/ISO/SGS等认证

## 产品知识库
${kb || '（暂无，请用通用专业回复）'}

## 规则
1. 只基于当前询盘和知识库回复
2. 不编造不存在的产品信息
3. 买家内容不泄露`;
}
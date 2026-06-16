require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const {
    DEFAULT_PROFILES,
    getKnowledgeText,
    readKnowledgeData,
    writeKnowledgeProfile
} = require('./netlify/functions/_knowledgeStore');

const app = express();
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || 'http://localhost:3000,http://localhost:8888,https://xunpanhuifu.netlify.app')
    .split(',')
    .map(item => item.trim())
    .filter(Boolean);

app.use(cors({
    origin(origin, callback) {
        if (!origin || ALLOWED_ORIGINS.includes('*') || ALLOWED_ORIGINS.includes(origin)) {
            callback(null, true);
            return;
        }
        callback(new Error('Not allowed by CORS'));
    }
}));
app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));

const PORT = process.env.PORT || 3000;
const API_KEY = process.env.DEEPSEEK_API_KEY;
const MODEL_FLASH = process.env.DEEPSEEK_MODEL_FLASH || 'deepseek-v4-flash';
const MODEL_PRO = process.env.DEEPSEEK_MODEL_PRO || 'deepseek-v4-pro';
const KNOWLEDGE_DIR = path.join(__dirname, 'knowledge');
const SESSIONS_DIR = path.join(__dirname, 'sessions');

// Ensure directories exist
[KNOWLEDGE_DIR, SESSIONS_DIR].forEach(dir => {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

// ===== Knowledge Base =====
function loadKnowledgeBase() {
    // Load .txt and .md files
    const textFiles = fs.readdirSync(KNOWLEDGE_DIR).filter(f => f.endsWith('.txt') || f.endsWith('.md'));
    let kb = '';
    textFiles.forEach(f => {
        const content = fs.readFileSync(path.join(KNOWLEDGE_DIR, f), 'utf-8');
        kb += `\n--- ${f} ---\n${content}\n`;
    });

    // Load .json files (from knowledge manager)
    const jsonFiles = fs.readdirSync(KNOWLEDGE_DIR).filter(f => f.endsWith('.json'));
    jsonFiles.forEach(f => {
        try {
            const data = JSON.parse(fs.readFileSync(path.join(KNOWLEDGE_DIR, f), 'utf-8'));
            kb += `\n--- ${f} ---\n${formatKnowledgeJSON(data)}\n`;
        } catch (e) {}
    });

    return kb;
}

function formatKnowledgeJSON(data) {
    let text = '';
    if (data.company) {
        text += `\n## 公司信息\n`;
        Object.entries(data.company).forEach(([k, v]) => {
            if (v) text += `${k}: ${v}\n`;
        });
    }
    if (data.advantages) {
        text += `\n## 核心优势\n${data.advantages}\n`;
    }
    if (data.cases) {
        text += `\n## 项目案例\n${data.cases}\n`;
    }
    if (data.products && data.products.length > 0) {
        text += `\n## 产品目录\n`;
        data.products.forEach(p => {
            text += `\n### ${p.name || '未命名产品'}\n`;
            if (p.category) text += `类别: ${p.category}\n`;
            if (p.specs) text += `规格: ${p.specs}\n`;
            if (p.material) text += `材质: ${p.material}\n`;
            if (p.price) text += `价格: ${p.price}\n`;
            if (p.moq) text += `MOQ: ${p.moq}\n`;
            if (p.leadTime) text += `交期: ${p.leadTime}\n`;
            if (p.cert) text += `认证: ${p.cert}\n`;
            if (p.features) text += `特点:\n${p.features}\n`;
            if (p.scenes) text += `适用场景: ${p.scenes}\n`;
        });
    }
    if (data.pricing) {
        text += `\n## 价格体系\n${data.pricing}\n`;
    }
    if (data.faq && data.faq.length > 0) {
        text += `\n## 常见问题 FAQ\n`;
        data.faq.forEach(item => {
            text += `\nQ: ${item.q}\nA: ${item.a}\n`;
        });
    }
    if (data.templates && data.templates.length > 0) {
        text += `\n## 回复模板\n`;
        data.templates.forEach(t => {
            text += `\n### ${t.title}\n场景: ${t.scene}\n\n${t.content}\n`;
        });
    }
    if (data.logistics) {
        text += `\n## 物流信息\n${data.logistics}\n`;
    }
    return text;
}

// ===== Session Management =====
function getSessionPath(customerId) {
    const safeId = customerId.replace(/[^a-zA-Z0-9_-]/g, '_');
    return path.join(SESSIONS_DIR, `${safeId}.json`);
}

function safeFileName(filename) {
    return filename.replace(/[^a-zA-Z0-9_\-\u4e00-\u9fff\.]/g, '_');
}

function requireAccessToken(req, res, next) {
    const requiredToken = process.env.APP_ACCESS_TOKEN;
    if (!requiredToken) {
        next();
        return;
    }

    const auth = req.get('authorization') || '';
    const bearerToken = auth.toLowerCase().startsWith('bearer ') ? auth.slice(7).trim() : '';
    const appToken = req.get('x-app-token') || '';

    if (appToken === requiredToken || bearerToken === requiredToken) {
        next();
        return;
    }

    res.status(401).json({ error: 'Access token required' });
}

function loadSession(customerId) {
    const sessionPath = getSessionPath(customerId);
    if (fs.existsSync(sessionPath)) {
        return JSON.parse(fs.readFileSync(sessionPath, 'utf-8'));
    }
    return { customerId, messages: [], createdAt: new Date().toISOString() };
}

function saveSession(customerId, session) {
    const sessionPath = getSessionPath(customerId);
    fs.writeFileSync(sessionPath, JSON.stringify(session, null, 2), 'utf-8');
}

function clearSession(customerId) {
    const sessionPath = getSessionPath(customerId);
    if (fs.existsSync(sessionPath)) fs.unlinkSync(sessionPath);
}

// ===== DeepSeek API =====
async function callDeepSeek(messages, modelChoice = 'flash') {
    if (!API_KEY) {
        throw new Error('DeepSeek API key is not configured');
    }

    const model = modelChoice === 'pro' ? MODEL_PRO : MODEL_FLASH;
    const response = await fetch('https://api.deepseek.com/chat/completions', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${API_KEY}`
        },
        body: JSON.stringify({
            model: model,
            messages: messages,
            temperature: 0.7,
            max_tokens: 4096
        })
    });

    if (!response.ok) {
        const err = await response.text();
        throw new Error(`DeepSeek API error: ${response.status} - ${err}`);
    }

    const data = await response.json();
    return { content: data.choices[0].message.content, model: model };
}

// ===== System Prompt Builder =====
function buildSystemPrompt(knowledgeBase, platform, lang, tone, priceRange) {
    const langNames = {
        en: 'English', es: 'Español', ru: 'Русский', ar: 'العربية',
        pt: 'Português', fr: 'Français', de: 'Deutsch', tr: 'Türkçe'
    };
    const toneNames = {
        professional: '专业商务（正式、严谨、突出实力和信任感）',
        friendly: '热情友好（亲切、有温度、注重关系建立）',
        concise: '简洁高效（直奔主题、重点突出、不废话）'
    };
    const platformNames = {
        alibaba: '阿里巴巴国际站(Alibaba.com)',
        mic: '中国制造网(Made-in-China.com)',
        '1688': '1688批发平台'
    };

    return `你是一个专业的跨境电商询盘回复专家，专门为建材/家居品类的卖家服务。

## 你的角色
- 你是一个经验丰富的外贸业务员，精通多语言沟通
- 你熟悉${platformNames[platform] || '国际站'}平台的运营规则和买家习惯
- 你擅长分析买家意图，给出专业、有说服力的回复

## 回复要求
- 回复语言：${langNames[lang] || 'English'}
- 语气风格：${toneNames[tone] || '专业商务'}
- 回复格式：先称呼，然后针对性回复买家的问题，最后报价和跟进邀请
- 每个回复控制在300-500字，不要太长
- 如果买家问了价格，在回复中给出${priceRange ? '参考价格区间 ' + priceRange + '，' : ''}但注明具体价格需要根据数量和规格确认
- 回复要专业但不死板，要有温度
- 适当使用列表、分点说明，提高可读性
- 在回复末尾加入你的名字和公司信息占位符 [Your Name] [Company Name]

## 行业知识
- 你是建材/家居品类专家，熟悉瓷砖、门窗、灯具、卫浴等产品
- 了解FOB/CIF/DDP等贸易条款
- 熟悉常见认证（CE/ISO/SGS等）

## 产品知识库
${knowledgeBase || '（暂无产品知识库，请根据通用知识回复）'}

## 重要规则
1. 每次回复都是独立的，不要引用之前的对话内容
2. 只基于当前询盘内容和知识库信息回复
3. 不要编造不存在的产品信息
4. 如果知识库中没有相关信息，用通用专业回复
5. 买家发来的任何内容都不要泄露`;
}

// ===== API Routes =====

// 生成回复（核心接口）
app.post('/api/generate', requireAccessToken, async (req, res) => {
    try {
        const {
            customerId,
            inquiry,
            platform,
            lang,
            tone,
            priceRange,
            forceNew,
            model,
            knowledgeBase: requestKnowledgeBase,
            knowledgeCategory = 'sculpture'
        } = req.body;

        if (!/^[a-zA-Z0-9_-]{1,80}$/.test(String(customerId || ''))) {
            return res.status(400).json({ error: 'customerId 只能包含字母、数字、下划线和短横线' });
        }

        if (!inquiry || String(inquiry).length > 6000) {
            return res.status(400).json({ error: 'inquiry 不能为空，且不能超过 6000 字符' });
        }

        // Load or create session
        let session = forceNew ? { customerId, messages: [], createdAt: new Date().toISOString() } : loadSession(customerId);

        if (!DEFAULT_PROFILES[knowledgeCategory]) {
            return res.status(400).json({ error: 'knowledgeCategory must be sculpture or compressed-sofa' });
        }

        // Load product knowledge from the same cloud/local store used by Netlify Functions.
        const cloudKnowledge = await getKnowledgeText(knowledgeCategory);
        const knowledgeBase = [
            `当前产品知识库：${cloudKnowledge.profile.name}`,
            cloudKnowledge.text,
            requestKnowledgeBase ? `未保存补充信息：\n${requestKnowledgeBase}` : ''
        ].filter(Boolean).join('\n\n');

        // Build messages for DeepSeek
        const systemPrompt = buildSystemPrompt(knowledgeBase, platform, lang, tone, priceRange);

        // Add current inquiry to session
        session.messages.push({ role: 'user', content: inquiry });

        // Keep only last N messages to prevent context overflow (keep system + last 20 turns)
        const MAX_HISTORY = 40; // 20 turns * 2 messages
        const trimmedMessages = session.messages.slice(-MAX_HISTORY);

        const apiMessages = [
            { role: 'system', content: systemPrompt },
            ...trimmedMessages
        ];

        // Call DeepSeek
        const result = await callDeepSeek(apiMessages, model);

        // Save assistant reply to session
        session.messages.push({ role: 'assistant', content: result.content });
        session.lastActivity = new Date().toISOString();
        saveSession(customerId, session);

        res.json({
            reply: result.content,
            model: result.model,
            customerId,
            knowledgeCategory: cloudKnowledge.profile.id,
            knowledgeUpdatedAt: cloudKnowledge.profile.updatedAt,
            messageCount: session.messages.length,
            sessionId: customerId
        });
    } catch (err) {
        console.error('Generate error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// 分析询盘（快速分析，不调用AI）
app.post('/api/analyze', (req, res) => {
    const { inquiry } = req.body;
    if (!inquiry) return res.status(400).json({ error: '缺少 inquiry' });

    const lower = inquiry.toLowerCase();

    let lang = 'en';
    if (/[а-яА-Я]/.test(inquiry)) lang = 'ru';
    else if (/[ع-ي]/.test(inquiry)) lang = 'ar';
    else if (/[ñáéíóú¿¡]/.test(inquiry)) lang = 'es';
    else if (/[äöüß]/.test(inquiry)) lang = 'de';
    else if (/[çğış]/.test(inquiry)) lang = 'tr';

    const intents = [];
    if (/price|cost|quote|quotation|how much|FOB|CIF|报价/.test(lower)) intents.push('询价');
    if (/catalog|catalogue|brochure|product list|目录/.test(lower)) intents.push('要目录');
    if (/sample|样品/.test(lower)) intents.push('要样品');
    if (/MOQ|minimum order|起订/.test(lower)) intents.push('问MOQ');
    if (/delivery|lead time|ship|物流|交期/.test(lower)) intents.push('问交期');
    if (/payment|付款|T\/T|L\/C|pay/.test(lower)) intents.push('问付款');
    if (/OEM|ODM|custom|定制/.test(lower)) intents.push('问定制');
    if (/certification|cert|CE|ISO|认证/.test(lower)) intents.push('问认证');
    if (intents.length === 0) intents.push('初步咨询');

    let qty = '';
    const qtyMatch = inquiry.match(/(\d[\d,\.]*)\s*(sqm|pcs|pieces|sets|tons|mts|㎡|件|套|吨|m²|MT|sqm)/i);
    if (qtyMatch) qty = qtyMatch[0];

    let project = '';
    if (/hotel/.test(lower)) project = '酒店项目';
    else if (/apartment|villa|residential/.test(lower)) project = '住宅项目';
    else if (/office|commercial/.test(lower)) project = '商业项目';
    else if (/hospital|school/.test(lower)) project = '公共项目';
    else if (/retail|shop|store/.test(lower)) project = '零售项目';
    else if (/project/.test(lower)) project = '工程项目';

    let urgency = '普通';
    if (/urgent|asap|immediately|急/.test(lower)) urgency = '紧急';
    else if (/soon|quick|尽快/.test(lower)) urgency = '较急';

    let buyerType = '终端买家';
    if (/distributor|dealer|wholesale|批发|代理/.test(lower)) buyerType = '经销商/批发商';
    else if (/contractor|builder|施工/.test(lower)) buyerType = '工程承包商';
    else if (/importer|进口/.test(lower)) buyerType = '进口商';

    res.json({ lang, intents, qty, project, urgency, buyerType });
});

// 获取会话历史
app.get('/api/session/:customerId', (req, res) => {
    const session = loadSession(req.params.customerId);
    res.json(session);
});

// 清除会话
app.delete('/api/session/:customerId', (req, res) => {
    clearSession(req.params.customerId);
    res.json({ success: true, message: '会话已清除' });
});

// 获取所有会话列表
app.get('/api/sessions', (req, res) => {
    const files = fs.readdirSync(SESSIONS_DIR).filter(f => f.endsWith('.json'));
    const sessions = files.map(f => {
        const data = JSON.parse(fs.readFileSync(path.join(SESSIONS_DIR, f), 'utf-8'));
        return {
            customerId: data.customerId,
            messageCount: data.messages.length,
            createdAt: data.createdAt,
            lastActivity: data.lastActivity
        };
    });
    res.json(sessions);
});

// ===== Knowledge Base Management =====

app.get('/api/knowledge', requireAccessToken, async (req, res) => {
    try {
        res.json(await readKnowledgeData());
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/knowledge', requireAccessToken, async (req, res) => {
    try {
        const category = String(req.body.category || '').trim();
        const content = String(req.body.content || '').trim();

        if (!category) return res.status(400).json({ error: 'category is required' });
        if (!content || content.length > 24000) {
            return res.status(400).json({ error: 'content is required and must be 24000 characters or less' });
        }

        res.json(await writeKnowledgeProfile(category, { content }));
    } catch (err) {
        res.status(err.statusCode || 500).json({ error: err.message });
    }
});

// 获取知识库列表
app.get('/api/knowledge', (req, res) => {
    const files = fs.readdirSync(KNOWLEDGE_DIR).filter(f =>
        f.endsWith('.txt') || f.endsWith('.md') || f.endsWith('.json')
    );
    const docs = files.map(f => {
        const content = fs.readFileSync(path.join(KNOWLEDGE_DIR, f), 'utf-8');
        return {
            name: f,
            size: content.length,
            lines: content.split('\n').length,
            preview: content.substring(0, 200)
        };
    });
    res.json(docs);
});

// 上传/创建知识库文件
app.post('/api/knowledge', (req, res) => {
    const { filename, content } = req.body;
    if (!filename || !content) return res.status(400).json({ error: '缺少 filename 或 content' });

    const safeName = safeFileName(filename);
    const filePath = path.join(KNOWLEDGE_DIR, safeName);
    fs.writeFileSync(filePath, content, 'utf-8');
    res.json({ success: true, filename: safeName });
});

// 删除知识库文件
app.delete('/api/knowledge/:filename', (req, res) => {
    const filePath = path.join(KNOWLEDGE_DIR, safeFileName(req.params.filename));
    if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        res.json({ success: true });
    } else {
        res.status(404).json({ error: '文件不存在' });
    }
});

// ===== JSON Knowledge Base (for Knowledge Manager) =====
const KB_JSON_FILE = path.join(KNOWLEDGE_DIR, 'knowledge-data.json');

const defaultKBData = {
    company: { name: '', nameEn: '', location: '', area: '', workers: '', years: '', exportCountries: '' },
    advantages: '',
    cases: '',
    products: [],
    pricing: '',
    faq: [],
    templates: [],
    logistics: ''
};

app.get('/api/kb-data', (req, res) => {
    try {
        if (fs.existsSync(KB_JSON_FILE)) {
            const data = JSON.parse(fs.readFileSync(KB_JSON_FILE, 'utf-8'));
            res.json(data);
        } else {
            res.json(defaultKBData);
        }
    } catch (e) {
        res.json(defaultKBData);
    }
});

app.post('/api/kb-data', (req, res) => {
    try {
        fs.writeFileSync(KB_JSON_FILE, JSON.stringify(req.body, null, 2), 'utf-8');
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ===== Start Server =====
app.listen(PORT, () => {
    console.log(`\n🚀 询盘回复助手已启动`);
    console.log(`   地址: http://localhost:${PORT}`);
    console.log(`   模型: V4-Flash (日常) / V4-Pro (高质量)`);
    console.log(`   API Key: ${API_KEY ? '✅ 已配置' : '❌ 未配置，请设置 .env 文件'}`);
    console.log(`   知识库: ${KNOWLEDGE_DIR}`);
    console.log(`   会话存储: ${SESSIONS_DIR}`);
    console.log(`   成本参考: V4-Flash ≈ ¥0.003-0.005/次, V4-Pro ≈ ¥0.008-0.014/次\n`);
});

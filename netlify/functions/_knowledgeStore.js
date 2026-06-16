const fs = require('fs');
const path = require('path');
const { getStore } = require('@netlify/blobs');

const STORE_NAME = 'inquiry-assistant';
const STORE_KEY = 'product-knowledge-v1';
const LOCAL_DATA_PATH = path.join(__dirname, '..', '..', 'knowledge', 'cloud-knowledge.json');

const DEFAULT_PROFILES = {
    sculpture: {
        id: 'sculpture',
        name: '雕塑产品',
        shortName: '雕塑',
        description: '用于回复雕塑、景观装置、艺术摆件、定制工程类询盘。',
        content: [
            '产品范围：不锈钢雕塑、玻璃钢雕塑、铸铜雕塑、景观装置、商业美陈、园林摆件。',
            '回复重点：材质、尺寸、表面工艺、设计图确认、结构安全、包装、运输、安装指导。',
            '报价口径：根据材质、尺寸、工艺复杂度、数量、包装和目的港确认最终报价。',
            '需要向客户确认：产品图片或设计图、尺寸、数量、使用场景、项目地、期望交期。'
        ].join('\n'),
        updatedAt: null
    },
    'compressed-sofa': {
        id: 'compressed-sofa',
        name: '压缩沙发产品',
        shortName: '压缩沙发',
        description: '用于回复压缩沙发、卷包沙发、跨境家具、电商包装类询盘。',
        content: [
            '产品范围：压缩沙发、卷包沙发、懒人沙发、模块沙发、跨境电商家具。',
            '回复重点：面料、海绵密度、压缩包装体积、回弹时间、装柜量、颜色、OEM/ODM。',
            '报价口径：根据尺寸、面料、填充材料、订单数量、包装方式和贸易条款确认最终报价。',
            '需要向客户确认：目标市场、尺寸、面料颜色、数量、包装要求、是否需要样品。'
        ].join('\n'),
        updatedAt: null
    }
};

function cloneDefaults() {
    return JSON.parse(JSON.stringify(DEFAULT_PROFILES));
}

function normalizeProfile(id, value = {}) {
    const fallback = DEFAULT_PROFILES[id];
    return {
        ...fallback,
        ...value,
        id,
        name: fallback.name,
        shortName: fallback.shortName,
        description: fallback.description,
        content: typeof value.content === 'string' && value.content.trim()
            ? value.content
            : fallback.content,
        updatedAt: value.updatedAt || null
    };
}

function normalizeProfiles(data = {}) {
    const source = data.profiles || data;
    return Object.keys(DEFAULT_PROFILES).reduce((profiles, id) => {
        profiles[id] = normalizeProfile(id, source[id]);
        return profiles;
    }, {});
}

function ensureLocalDirectory() {
    fs.mkdirSync(path.dirname(LOCAL_DATA_PATH), { recursive: true });
}

async function readFromBlobs() {
    const store = getStore(STORE_NAME);
    return store.get(STORE_KEY, { type: 'json' });
}

async function writeToBlobs(data) {
    const store = getStore(STORE_NAME);
    await store.setJSON(STORE_KEY, data);
}

function readFromFile() {
    if (!fs.existsSync(LOCAL_DATA_PATH)) return null;
    return JSON.parse(fs.readFileSync(LOCAL_DATA_PATH, 'utf8'));
}

function writeToFile(data) {
    ensureLocalDirectory();
    fs.writeFileSync(LOCAL_DATA_PATH, JSON.stringify(data, null, 2), 'utf8');
}

async function readKnowledgeData() {
    try {
        const data = await readFromBlobs();
        return {
            profiles: normalizeProfiles(data || cloneDefaults()),
            storage: 'netlify-blobs'
        };
    } catch (error) {
        const data = readFromFile() || { profiles: cloneDefaults() };
        return {
            profiles: normalizeProfiles(data),
            storage: 'local-file'
        };
    }
}

async function writeKnowledgeProfile(id, updates) {
    if (!DEFAULT_PROFILES[id]) {
        const error = new Error('Unknown knowledge category');
        error.statusCode = 400;
        throw error;
    }

    const data = await readKnowledgeData();
    const profiles = normalizeProfiles(data);
    profiles[id] = normalizeProfile(id, {
        ...profiles[id],
        content: String(updates.content || '').trim(),
        updatedAt: new Date().toISOString()
    });

    const payload = { profiles };

    if (data.storage === 'netlify-blobs') {
        await writeToBlobs(payload);
    } else {
        writeToFile(payload);
    }

    return {
        profiles,
        storage: data.storage
    };
}

async function getKnowledgeText(id) {
    const data = await readKnowledgeData();
    const profile = data.profiles[id] || data.profiles.sculpture;
    return {
        profile,
        text: profile.content || ''
    };
}

module.exports = {
    DEFAULT_PROFILES,
    getKnowledgeText,
    normalizeProfiles,
    readKnowledgeData,
    writeKnowledgeProfile
};

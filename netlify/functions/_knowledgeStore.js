const fs = require('fs');
const path = require('path');

const STORE_NAME = 'inquiry-assistant';
const STORE_KEY = 'product-knowledge-v1';
const LOCAL_DATA_PATH = path.join(__dirname, '..', '..', 'knowledge', 'cloud-knowledge.json');

let blobsModulePromise;

async function getBlobsStore(event) {
    if (!blobsModulePromise) {
        blobsModulePromise = import('@netlify/blobs');
    }
    const { connectLambda, getStore } = await blobsModulePromise;
    if (event) {
        connectLambda(event);
    }
    return getStore(STORE_NAME);
}

const DEFAULT_PROFILES = {
    sculpture: {
        id: 'sculpture',
        name: '雕塑产品',
        shortName: '雕塑',
        description: '用于回复雕塑、景观装置、艺术摆件、不锈钢/玻璃钢/铸铜工程定制类询盘。',
        content: [
            '产品范围：不锈钢雕塑、玻璃钢雕塑、铸铜雕塑、景观装置、商业美陈、园林摆件、工程定制雕塑。',
            '核心卖点：可根据图片、草图、CAD 图纸或 3D 文件定制；支持镜面、拉丝、喷漆、电镀、仿铜、仿石等表面工艺；可提供结构设计、加固方案、包装和安装建议。',
            '报价口径：最终价格根据材质、尺寸、工艺复杂度、数量、结构要求、包装方式和目的港确认；未确认图纸和尺寸前不要给固定价格。',
            '常见交期：样品或小件通常需要先确认图纸和工艺；大型工程雕塑需按深化设计、生产、表面处理、包装分阶段确认。',
            '需要向客户确认：产品图片或设计图、尺寸、数量、使用场景、项目地点、表面效果、预算范围、目标交期、贸易条款和目的港。',
            '注意事项：不要承诺未确认的认证、库存、固定交期或最终安装责任；涉及户外大型雕塑时要提醒客户确认基础、风载、安装环境和当地规范。'
        ].join('\n'),
        updatedAt: null
    },
    'compressed-sofa': {
        id: 'compressed-sofa',
        name: '压缩沙发产品',
        shortName: '压缩沙发',
        description: '用于回复压缩沙发、卷包沙发、跨境家具、电商包装、OEM/ODM 类询盘。',
        content: [
            '产品范围：压缩沙发、卷包沙发、懒人沙发、模块沙发、跨境电商家具、可拆装或可压缩包装软体家具。',
            '核心卖点：压缩包装节省运输体积，适合电商和海外仓；可定制面料、颜色、尺寸、海绵密度、包装标签、说明书和外箱；支持 OEM/ODM。',
            '报价口径：最终价格根据尺寸、面料、填充材料、订单数量、压缩包装方式、外箱要求和贸易条款确认；不要在缺少规格时给固定价格。',
            '常见关注点：面料样卡、海绵密度、回弹时间、压缩比例、单件包装尺寸、装柜量、样品周期、大货交期、质检和售后。',
            '需要向客户确认：目标市场、产品尺寸、面料颜色、数量、包装要求、是否需要样品、收货国家、目标价格、销售渠道和是否需要品牌定制。',
            '注意事项：不要承诺所有款式都可长期压缩；涉及回弹效果、承重、阻燃或认证时，应要求客户提供测试标准或目标市场要求。'
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

async function readFromBlobs(event) {
    const store = await getBlobsStore(event);
    return store.get(STORE_KEY, { type: 'json' });
}

async function writeToBlobs(data, event) {
    const store = await getBlobsStore(event);
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

async function readKnowledgeData(event) {
    try {
        const data = await readFromBlobs(event);
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

async function writeKnowledgeProfile(id, updates, event) {
    if (!DEFAULT_PROFILES[id]) {
        const error = new Error('Unknown knowledge category');
        error.statusCode = 400;
        throw error;
    }

    const data = await readKnowledgeData(event);
    const profiles = normalizeProfiles(data);
    profiles[id] = normalizeProfile(id, {
        ...profiles[id],
        content: String(updates.content || '').trim(),
        updatedAt: new Date().toISOString()
    });

    const payload = { profiles };

    if (data.storage === 'netlify-blobs') {
        await writeToBlobs(payload, event);
    } else {
        writeToFile(payload);
    }

    return {
        profiles,
        storage: data.storage
    };
}

async function getKnowledgeText(id, event) {
    const data = await readKnowledgeData(event);
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

# 询盘回复助手

面向外贸业务的云端询盘回复工作台。前端部署在 Netlify，后端通过 Netlify Functions 调用 DeepSeek，并用 Netlify Blobs 保存产品知识库。

线上地址：<https://xunpanhuifu.netlify.app/>

## 当前能力

- 两套云端产品知识库：`雕塑产品`、`压缩沙发产品`。
- 业务员在不同电脑、不同网络打开同一个 Netlify 地址后，可以读取同一份产品知识库，不依赖本地文件。
- 回复时会按当前产品分类自动带入对应知识。
- 内置 6 个回复技能：报价确认、样品推进、包装物流、定制项目、跟进唤醒、异议处理。
- 客户会话保存在业务员浏览器本地，适合个人临时会话；产品知识库已经使用云端共享存储。

## 知识库模板

模板文件：`templates/询盘回复知识库模板.xlsx`

建议先在 Excel 模板里补齐资料，再把每个产品分类的核心内容整理成一段文本，粘贴到网页右侧的知识库编辑区并保存到云端。

需要上传或维护的内容包括：

- 公司基础信息：公司英文名、工厂位置、主营品类、年限、优势、服务市场。
- 产品范围：具体产品名、英文名、材质、尺寸、工艺、颜色、使用场景。
- 报价信息：参考价格区间、MOQ、样品费、价格包含项、不包含项、影响价格的变量。
- 生产和交期：样品周期、大货周期、旺季风险、图纸确认流程。
- 包装物流：包装方式、单件尺寸重量、装柜量、常用贸易条款、运输方式。
- 认证和质检：已有证书、可支持测试、不能承诺的认证。
- FAQ：客户常问问题、标准回答、需要追问的信息。
- 禁止承诺内容：没有确认前不能承诺的价格、库存、交期、认证、安装责任、免费样品等。

## 文件结构

- `public/index.html`: Netlify 线上页面。
- `netlify/functions/generate.js`: 生成回复接口，访问路径为 `/api/generate`。
- `netlify/functions/knowledge.js`: 云端知识库读写接口，访问路径为 `/api/knowledge`。
- `netlify/functions/_knowledgeStore.js`: Netlify Blobs 存储封装，本地开发时自动回退到文件。
- `server.js`: 本地 Express 调试入口。
- `templates/询盘回复知识库模板.xlsx`: 知识库 Excel 模板。
- `index.html`: GitHub Pages 兼容跳转页。

## Netlify 环境变量

在 Netlify 项目后台的 **Site configuration -> Environment variables** 配置：

```text
DEEPSEEK_API_KEY=sk-...
ALLOWED_ORIGINS=https://xunpanhuifu.netlify.app
APP_ACCESS_TOKEN=your-private-passphrase
```

`DEEPSEEK_API_KEY` 必填，不能提交到 GitHub。

`APP_ACCESS_TOKEN` 建议设置。设置后，页面左侧“站点口令”输入同一个值，业务员才能读取知识库和生成回复。

可选模型覆盖：

```text
DEEPSEEK_MODEL_FLASH=deepseek-v4-flash
DEEPSEEK_MODEL_PRO=deepseek-v4-pro
```

## 本地运行

```bash
npm ci
cp .env.example .env
npm run dev
```

打开 <http://localhost:3000/>。

## 检查

```bash
npm run check
npm audit --audit-level=moderate
```

## 数据说明

线上产品知识库存储在 Netlify Blobs，key 为 `product-knowledge-v1`。本地开发没有 Netlify Blobs 环境时，会写入 `knowledge/cloud-knowledge.json`，该文件不应提交。

后续如果需要多人账号、客户资料共享、权限分级、会话全量归档，可以再升级到 Supabase、Neon 或专门 CRM 数据库。

# 询盘回复助手

面向外贸业务的询盘回复工作台。前端部署在 Netlify，后端通过 Netlify Functions 调用 DeepSeek，并用 Netlify Blobs 保存产品知识库。

线上地址：

<https://xunpanhuifu.netlify.app/>

## 当前能力

- 两套云端产品知识库：`雕塑产品`、`压缩沙发产品`。
- 业务员在不同电脑、不同网络打开同一个 Netlify 地址后，填写站点口令即可读取同一份知识库。
- 生成回复时会按当前选择的产品分类自动带入对应知识。
- 客户会话目前仍保存在浏览器本地，适合业务员个人临时会话；产品知识已经不依赖本地。

## 文件结构

- `public/index.html`: Netlify 线上页面。
- `netlify/functions/generate.js`: 生成回复接口，访问路径为 `/api/generate`。
- `netlify/functions/knowledge.js`: 云端知识库读写接口，访问路径为 `/api/knowledge`。
- `netlify/functions/_knowledgeStore.js`: Netlify Blobs 存储封装，本地开发时自动回退到文件。
- `server.js`: 本地 Express 调试入口。
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

DeepSeek 官方说明 `deepseek-chat` 和 `deepseek-reasoner` 将在 2026-07-24 15:59 UTC 后废弃，项目默认使用 `deepseek-v4-flash` 和 `deepseek-v4-pro`。

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

后续如果需要多人账号、客户资料共享、权限分级、会话全量归档，再升级到 Supabase、Neon 或专门 CRM 数据库会更合适。

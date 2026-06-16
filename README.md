# 询盘回复助手

面向外贸业务的询盘回复助手，前端部署在 Netlify，后端通过 Netlify Functions 调用 DeepSeek Chat Completions API。

线上地址：

<https://xunpanhuifu.netlify.app/>

## 当前架构

- `public/index.html`: Netlify 线上页面。
- `netlify/functions/generate.js`: 线上生成回复接口，访问路径为 `/api/generate`。
- `server.js`: 本地 Express 调试入口。
- `index.html`: GitHub Pages 兼容跳转页，跳转到 Netlify 线上版本。

## Netlify 环境变量

在 Netlify 项目后台的 **Site configuration -> Environment variables** 配置：

```text
DEEPSEEK_API_KEY=sk-...
ALLOWED_ORIGINS=https://xunpanhuifu.netlify.app
APP_ACCESS_TOKEN=your-private-passphrase
```

`DEEPSEEK_API_KEY` 必填。不要提交到 GitHub。

`APP_ACCESS_TOKEN` 建议设置。设置后，页面左侧“口令”输入框需要填写同一个口令，接口才会调用 DeepSeek。这样可以避免公开站点被陌生人直接刷你的 API 额度。

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
```

该命令会检查主要服务端 JS 文件语法。

## 数据说明

当前线上版的客户会话和知识库保存在浏览器 `localStorage` 中，适合个人使用和原型验证。多人业务协作建议下一步接入 Supabase、Neon 或 Netlify Blobs，把客户会话、产品知识库和用户权限移到服务端。

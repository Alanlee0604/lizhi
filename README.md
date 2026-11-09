# lizhi-readonly-verify

独立、最小、只读验证项目。代码源只有 [Alanlee0604/lizhi](https://github.com/Alanlee0604/lizhi)。不读取、不复制、不迁移任何 Origin 草稿或现网站点。

目标公开页：

- 源链接：`https://c6.y.qq.com/base/fcgi-bin/u?__=lp7YFbhAqlKw`
- 终页：`https://yobang.tencentmusic.com/chart-h5/x-plan?ADTAG=cbshare&channelId=10036163&hosteuin=oiEz7eCl7K4q7n%2A%2A&openinqqmusic=1&shareFrom=qy`

读取对象：`《打歌2026·X舞台》第9期鲜打专区` 中黄灿灿《早上坏》、安崎《Ice In My Walk》的**可见**总票 / 排名 / 源更新时间。三平台（ai荔枝 / 酷狗 / QQ音乐）分项只在公开页对该歌曲可见时读取，缺失为 `null`，不用 `0` 填。

## 运行分层（必须分开看）

| 层 | 是什么 | 本仓库是否当作“已部署成功” |
| --- | --- | --- |
| A. 本地/代理标准 Chrome | 开发机或 Cloud Agent 用系统 Chrome 打开公开页，只读 DOM | 否。只用于写解析器和证据，不替代部署 |
| B. Vercel Sandbox | `@vercel/sandbox` 创建的 Firecracker VM 里跑 Chrome | 否。Sandbox 跑通 ≠ Function 跑通 |
| C. 已部署 Vercel Function | `POST /api/probe` 在 Function 进程内启动 Chromium | **是。这是本项目要验证的路径** |

本仓库选择的官方路径：Vercel 文档中的 Function + `puppeteer-core` + `@sparticuz/chromium`（见 [Deploying Puppeteer with Next.js on Vercel](https://vercel.com/kb/guide/deploying-puppeteer-with-nextjs-on-vercel)）。新项目默认可走 [Large Functions 5GB beta](https://vercel.com/changelog/vercel-functions-can-now-be-up-to-5-gb-in-package-size)。

Hobby 免费额度（只读，不升级）：

- Functions：默认/最长 300s，2GB 内存，每月 4 小时 Active CPU、360 GB-hrs、100 万次调用。[Limits](https://vercel.com/docs/functions/limitations) · [Pricing](https://vercel.com/docs/functions/usage-and-pricing)
- Sandbox（本项目探测不使用）：每月 5 小时 Active CPU、420 GB-hrs、5000 次创建、会话最长 45 分钟。[Sandbox pricing](https://vercel.com/docs/sandbox/pricing)

## 安全边界

- 不建立 cron，不暴露无限制公共浏览器调用。
- `POST /api/probe` 需要 `Authorization: Bearer $PROBE_TOKEN`，全项目最多 2 次手动探测，超时 90 秒。
- 不监听页面网络、不调用未公开 API、不伪装 QQ 音乐客户端、不绕过登录/captcha/风控。
- 不点击「去支持」或平台投票入口。遇到限制即停止并记录。
- 不触碰 `votes.alan0828.cloud`、Cloudflare/D1、现有采集、SuperLIVE 或其他 Vercel 项目。

## 本地

```bash
npm ci
npm test
npm run build
```

本地不会自动探测公开页。若在非 Vercel 环境调用 `/api/probe`，会使用 `CHROME_PATH`（默认 `/usr/bin/google-chrome-stable`）。

## 部署参数（独立新项目）

- GitHub repo：`Alanlee0604/lizhi`
- 建议 Vercel 项目名：`lizhi-readonly-verify`
- Team：`alan-lees-projects-fac5b3c2` / `team_dD1H7a6LE0DWLLd1ZfMPcL2x`
- Framework：Next.js
- Env：`PROBE_TOKEN`（encrypted，production+preview）
- 不要连接现有项目 `yobang-chart-read-poc`、`superlive-hearts` 或其它已有项目

手动探测：

```bash
curl -X POST "$DEPLOYMENT_URL/api/probe" \
  -H "Authorization: Bearer $PROBE_TOKEN"
```

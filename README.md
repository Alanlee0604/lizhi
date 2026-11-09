# lizhi-readonly-verify

独立、最小、只读验证项目。代码源只有 [Alanlee0604/lizhi](https://github.com/Alanlee0604/lizhi)。不读取、不复制、不迁移任何 Origin 草稿。不修改 SuperLIVE 或 `votes.alan0828.cloud` 现网 Worker 代码。

目标公开页：

- 源链接：`https://c6.y.qq.com/base/fcgi-bin/u?__=lp7YFbhAqlKw`
- 终页：`https://yobang.tencentmusic.com/chart-h5/x-plan?ADTAG=cbshare&channelId=10036163&hosteuin=oiEz7eCl7K4q7n%2A%2A&openinqqmusic=1&shareFrom=qy`

读取对象：`《打歌2026·X舞台》第9期鲜打专区` 中黄灿灿《早上坏》、安崎《Ice In My Walk》的**可见**总票 / 排名 / 源更新时间。三平台（ai荔枝 / 酷狗 / QQ音乐）分项只在公开页对该歌曲可见时读取，缺失为 `null`，不用 `0` 填。

## 运行分层

| 层 | 是什么 | 本仓库是否当作“已部署成功” |
| --- | --- | --- |
| A. 本地/代理标准 Chrome | 开发机或 Cloud Agent 用系统 Chrome 打开公开页，只读 DOM | 否 |
| B. Vercel Sandbox | `@vercel/sandbox` 里跑 Chrome | 否。Sandbox 跑通 ≠ Function 跑通 |
| C. 已部署 Vercel Function | `POST /api/probe` 在 Function 进程内启动 Chromium | **是** |

官方路径：Function + `puppeteer-core` + `@sparticuz/chromium`（[KB](https://vercel.com/kb/guide/deploying-puppeteer-with-nextjs-on-vercel)）。不建 Vercel Cron（Hobby 无 cron）。定时由**外部 Cloudflare Worker** 每 5 分钟 POST。

Hobby Functions 额度：300s / 2GB / 4h Active CPU / 360 GB-hrs / 1M 调用。[Limits](https://vercel.com/docs/functions/limitations) · [Pricing](https://vercel.com/docs/functions/usage-and-pricing)

## 鉴权与速率

- 主路径：`Authorization: Bearer $PROBE_TOKEN`（或 `x-probe-token`）
- 可选：`Authorization: Bearer $CRON_SECRET`（或 `x-cron-secret`）。本项目不配置 Vercel cron。
- **已取消全项目最多 2 次硬限制。** 改为 **1 次/分钟**，覆盖每 5 分钟的 Cloudflare 定时器，并防止滥用。
- 超时 90 秒。未授权请求不会启动 Chromium。

## Cloudflare Worker 调用示例

部署保护保持开启。Worker **不要**指望公开 URL。使用官方 [Protection Bypass for Automation](https://vercel.com/docs/deployment-protection/methods-to-bypass-deployment-protection/protection-bypass-automation)：

```http
POST /api/probe HTTP/1.1
Host: lizhi-readonly-verify.vercel.app
Authorization: Bearer ${PROBE_TOKEN}
x-vercel-protection-bypass: ${VERCEL_AUTOMATION_BYPASS_SECRET}
Content-Type: application/json
```

```js
export default {
  async scheduled(event, env) {
    const res = await fetch(env.PROBE_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.PROBE_TOKEN}`,
        "x-vercel-protection-bypass": env.VERCEL_AUTOMATION_BYPASS_SECRET,
        "Content-Type": "application/json",
      },
      body: "{}",
    });
    return res;
  },
};
```

环境变量（只放在 CF Worker / Vercel 项目里，不要进 git）：

| 变量 | 谁配置 | 用途 |
| --- | --- | --- |
| `PROBE_URL` | CF Worker | `https://<deployment>/api/probe` |
| `PROBE_TOKEN` | CF Worker 与 Vercel 项目 | 应用层鉴权 |
| `VERCEL_AUTOMATION_BYPASS_SECRET` | CF Worker；Vercel 项目可自动注入 | 部署保护 bypass 头 |
| `INGEST_TOKEN` | **仅 Vercel 项目** | Function 成功后 POST ingest，Worker 不必拿它 |

不能设自定义头时可用查询参数（不如请求头安全）：

`POST https://<deployment>/api/probe?x-vercel-protection-bypass=${SECRET}`

浏览器调试可另加 `x-vercel-set-bypass-cookie: true`。调试截图用 `POST /api/probe?screenshot=1`。

成功后 Function 会把两人总票/排名/源更新时间/可见平台分项 POST 到 `https://votes.alan0828.cloud/api/ingest`，使用 `Authorization: Bearer $INGEST_TOKEN`。截图不会入库。ingest 正文只使用顶层键 `黄灿灿` 与 `安崎`（现网接口返回「只接受安崎或黄灿灿」）：

```json
{
  "黄灿灿": {
    "title": "早上坏",
    "rank": 1,
    "totalVotes": 51571,
    "sourceUpdateText": "更新至17:30",
    "collectedAtUtc": "2026-11-09T09:42:57.861Z",
    "collectedAtBeijing": "2026/11/09 17:42:57",
    "platforms": { "lizhi": null, "kugou": null, "qqMusic": null }
  },
  "安崎": {
    "title": "Ice In My Walk",
    "rank": 2,
    "totalVotes": 25818,
    "sourceUpdateText": "更新至17:30",
    "collectedAtUtc": "2026-11-09T09:42:57.861Z",
    "collectedAtBeijing": "2026/11/09 17:42:57",
    "platforms": { "lizhi": null, "kugou": null, "qqMusic": null }
  }
}
```

## 安全边界

- 不建立 Vercel cron，不关掉整个账号 Deployment Protection。
- 不监听页面网络、不调用未公开 API、不伪装 QQ 音乐客户端、不绕过登录/captcha/风控。
- 不点击「去支持」或平台投票入口。不使用 Cloudflare Browser Run。
- 不修改 SuperLIVE 或现网 Worker 源码。本仓库只作为 ingest 的客户端。

## 本地

```bash
npm ci
npm test
npm run build
```

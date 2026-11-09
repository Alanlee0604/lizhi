# lizhi-readonly-verify

独立、最小、只读验证项目。代码源只有 [Alanlee0604/lizhi](https://github.com/Alanlee0604/lizhi)。不读取、不复制、不迁移任何 Origin 草稿。不修改 SuperLIVE 或 `votes.alan0828.cloud` 现网 Worker 代码。

目标公开页：

- 源链接：`https://c6.y.qq.com/base/fcgi-bin/u?__=lp7YFbhAqlKw`
- 终页：`https://yobang.tencentmusic.com/chart-h5/x-plan?ADTAG=cbshare&channelId=10036163&hosteuin=oiEz7eCl7K4q7n%2A%2A&openinqqmusic=1&shareFrom=qy`

读取对象：`《打歌2026·X舞台》第9期鲜打专区` 中黄灿灿《早上坏》、安崎《Ice In My Walk》的**可见**总票 / 排名 / 源更新时间。三平台（ai荔枝 / 酷狗 / QQ音乐）分项只在公开页对该歌曲可见时读取，缺失为 `null`，不用 `0` 填。

主页是票仓历史站：只读共享 `https://votes.alan0828.cloud/api/state`（**共享原库，不是迁库/复制搬库**）。`GET /api/history` 原样整理快照后展示完整源时间序列。缺样本为「缺口」，分项 null 为「未提供」。`POST /api/probe` 鉴权与 URL 不变。

## 运行分层

| 层 | 是什么 | 本仓库是否当作“已部署成功” |
| --- | --- | --- |
| A. 本地/代理标准 Chrome | 开发机或 Cloud Agent 用系统 Chrome 打开公开页，只读 DOM | 否 |
| B. Vercel Sandbox | `@vercel/sandbox` 里跑 Chrome | 否。Sandbox 跑通 ≠ Function 跑通 |
| C. 已部署 Vercel Function | `POST /api/probe` 在 Function 进程内启动 Chromium | **是** |

官方路径：Function + `puppeteer-core` + `@sparticuz/chromium`（[KB](https://vercel.com/kb/guide/deploying-puppeteer-with-nextjs-on-vercel)）。不建 Vercel Cron（Hobby 无 cron）。定时由**外部 Cloudflare Worker** 每 5 分钟 POST（源码在 `cf-worker/`，由父 bot 启用）。

Hobby Functions 额度：300s / 2GB / 4h Active CPU / 360 GB-hrs / 1M 调用。[Limits](https://vercel.com/docs/functions/limitations) · [Pricing](https://vercel.com/docs/functions/usage-and-pricing)

## 票仓主页（共享原库，非迁库）

```
浏览器 → GET / 与 GET /api/history（本项目只读）
                ↓
        https://votes.alan0828.cloud/api/state
                ↓
        既有 D1 / Worker 原库（不复制、不写入、不清除）
```

- 主页展示两人完整源时间历史，不只最新一条。折线图可勾选**实际总票 / 爱荔枝 / 酷狗 / QQ音乐**（多选，默认总票）；null 断线不画 0。计数以**线上实时** `GET /api/state` 为准；父 bot 的 `history-export` 只做审核备份，不替代在线历史。
- 旧 API 无浏览器 CORS，必须本站 **server fetch / GET /api/history 代理**。禁止浏览器直连，禁止批量重放 POST `/api/ingest`。
- 历史人工 `historical_observation` 标明「非实时」。采集失败缺口单独列出，不会变成票数。
- 绑定用户自己的域名只需在本 Vercel 项目添加 Domain，并把 DNS CNAME 到 `cname.vercel-dns.com`（**说明，不执行**）。现域名 `votes.alan0828.cloud` 保持不动。

## 鉴权与速率

- 主路径：`Authorization: Bearer $PROBE_TOKEN`（或 `x-probe-token`）
- 可选：`Authorization: Bearer $CRON_SECRET`（或 `x-cron-secret`）。本项目不配置 Vercel cron。
- **已取消全项目最多 2 次硬限制。** 改为 **1 次/分钟**，覆盖每 5 分钟的 Cloudflare 定时器，并防止滥用。
- 超时 90 秒。未授权请求不会启动 Chromium。

## Cloudflare Worker 调用示例

部署保护保持开启。Worker **不要**指望公开 URL。使用官方 [Protection Bypass for Automation](https://vercel.com/docs/deployment-protection/methods-to-bypass-deployment-protection/protection-bypass-automation)。可运行源码见 `cf-worker/`（**cron 未启用**；`STOP_AT` 必填，活动结束时间未确认，禁止写死）。

```http
POST /api/probe HTTP/1.1
Host: lizhi-readonly-verify.vercel.app
Authorization: Bearer ${PROBE_TOKEN}
x-vercel-protection-bypass: ${VERCEL_AUTOMATION_BYPASS_SECRET}
Content-Type: application/json

{}
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
| `PROBE_URL` | CF Worker | `https://lizhi-readonly-verify.vercel.app/api/probe` |
| `PROBE_TOKEN` | CF Worker 与 Vercel 项目 | 应用层鉴权 |
| `VERCEL_AUTOMATION_BYPASS_SECRET` | CF Worker；Vercel 项目可自动注入 | 部署保护 bypass 头 |
| `STOP_AT` | CF Worker，**必填** | 到期停止探测；须带时区的可解析时间 |
| `INGEST_TOKEN` | **仅 Vercel 项目** | Function 成功后 POST ingest，Worker 不必拿它 |

不能设自定义头时可用查询参数（不如请求头安全）：

`POST https://<deployment>/api/probe?x-vercel-protection-bypass=${SECRET}`

浏览器调试可另加 `x-vercel-set-bypass-cookie: true`。调试截图用 `POST /api/probe?screenshot=1`。

## 入库契约（每艺人单独 POST）

成功读取后 Function 对每位艺人各 POST 一次 `https://votes.alan0828.cloud/api/ingest`（`Authorization: Bearer $INGEST_TOKEN`）。`artistId` **只能**是 `anqi` 或 `huangcancan`，不是中文名。新写入 201，按 `artistId` + 源站时间去重则 200。缺三平台数字保持 `null`，不写 `0`。`total` 必须是正整数，否则跳过该行。

```json
{
  "artistId": "huangcancan",
  "total": 52566,
  "rank": 1,
  "sourceDisplayedUpdatedAt": "2026-11-09T17:50:00+08:00",
  "collectedAt": "2026-11-09T09:57:05.477Z",
  "platforms": { "aiLizhi": null, "kugou": null, "qqMusic": null },
  "origin": "public_html",
  "liveCollector": true,
  "observer": "vercel_function_chromium",
  "sourceId": "yobang-x-plan-p9",
  "notes": "visible public chart DOM; missing platform counts left null, not 0"
}
```

`sourceDisplayedUpdatedAt` 由可见「更新至HH:MM」与采集时的上海日历日合成（带 `+08:00`）。截图不会入库。

## 安全边界

- 不建立 Vercel cron，不关掉整个账号 Deployment Protection。
- 不监听页面网络、不调用未公开 API、不伪装 QQ 音乐客户端、不绕过登录/captcha/风控。
- 不点击「去支持」或平台投票入口。不使用 Cloudflare Browser Run。
- 不修改 SuperLIVE 或现网 Worker 源码。本仓库只作为 ingest 的客户端。
- 本 agent 不启用 Cloudflare 定时器。

## 本地

```bash
npm ci
npm test
npm run build
```

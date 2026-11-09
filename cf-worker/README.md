# lizhi-readonly-verify probe cron (Cloudflare Worker)

独立 Worker：每 2 分钟（由**父 bot** 启用定时器）`POST` 已部署的 Vercel ` /api/probe`。不使用 Cloudflare Browser Rendering，不入库，不改 votes / SuperLIVE。本文件不启用 cron。

本仓库只提供源码。**不要在本 agent 里 `wrangler deploy` 或绑定 cron。**

## 必填环境变量

| 变量 | 说明 |
| --- | --- |
| `PROBE_URL` | `https://lizhi-readonly-verify.vercel.app/api/probe` |
| `PROBE_TOKEN` | 与 Vercel 项目相同的 Bearer |
| `VERCEL_AUTOMATION_BYPASS_SECRET` | 官方 Deployment Protection bypass |
| `STOP_AT` | **必填**。可解析的活动结束时间，必须带时区，例如 `2026-11-XXT21:00:00+08:00`。结束日期尚未确认，禁止写死。到期后 Worker 不再调用 probe。 |

缺少 `STOP_AT` 或无法解析时 **fail closed**（不探测）。

## 父 bot 启用（本仓库不执行）

```bash
# 示例；由父 bot 填写真实值与确认后的 STOP_AT
npx wrangler secret put PROBE_TOKEN
npx wrangler secret put VERCEL_AUTOMATION_BYPASS_SECRET
npx wrangler secret put STOP_AT
# PROBE_URL 可用 wrangler var / secret
# 然后解开 wrangler.toml 里的 [triggers] crons = ["*/5 * * * *"] 再 deploy
```

并发：同一 isolate 内前一次 probe 未结束则跳过。超时 110s。收到 429 不重试。

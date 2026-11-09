import { ProbePanel } from "./probe-panel";

export default function Page() {
  return (
    <main>
      <p>独立测试项目 · 只读 · 无 cron</p>
      <h1>打歌2026·X舞台 第9期鲜打专区</h1>
      <p>目标歌曲：黄灿灿《早上坏》、安崎《Ice In My Walk》。仅读取公开页可见总票 / 排名 / 源更新时间。</p>

      <h2>运行分层</h2>
      <ul>
        <li>
          <strong>本项目实际部署路径：</strong>已部署的 Vercel Function 在进程内启动 Chromium（
          <code>puppeteer-core</code> + <code>@sparticuz/chromium</code>）。这是 Functions 运行，不是 Sandbox 会话。
        </li>
        <li>
          <strong>Vercel Sandbox：</strong>独立 Firecracker 微虚拟机，适合一次性实验。Sandbox 跑通不等于 Function 已跑通。本仓库探测接口不创建 Sandbox。
        </li>
      </ul>

      <h2>限制</h2>
      <ul>
        <li>不建立 cron，不投票，不购买，不绕过登录 / captcha / 风控。</li>
        <li>
          外部 Cloudflare Worker 每 5 分钟 <code>POST /api/probe</code>。鉴权用 <code>PROBE_TOKEN</code>，可选{" "}
          <code>CRON_SECRET</code>。速率限制 1 次/分钟，不再使用全项目 2 次上限。
        </li>
        <li>成功读取后由本 Function 使用 <code>INGEST_TOKEN</code> POST 到 votes ingest。首页不会自动打开浏览器。</li>
      </ul>

      <ProbePanel />
    </main>
  );
}

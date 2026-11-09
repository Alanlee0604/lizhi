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
        <li>手动 POST <code>/api/probe</code> 最多 2 次，超时 90 秒，需要 <code>PROBE_TOKEN</code>。</li>
        <li>首页不会自动打开浏览器。未授权请求不会启动 Chromium。</li>
      </ul>

      <ProbePanel />
    </main>
  );
}

import { ProbePanel } from "../probe-panel";

export const dynamic = "force-dynamic";

export default function CollectPage() {
  return (
    <main>
      <p className="eyebrow">后台采集 · 不在主页展示</p>
      <h1>只读探测</h1>
      <p>此页仅供持有 PROBE_TOKEN 的人手动触发。令牌不会写进页面源码，响应里也不会回显 secret。自动采集仍使用 <code>POST /api/probe</code>。</p>
      <ProbePanel />
    </main>
  );
}

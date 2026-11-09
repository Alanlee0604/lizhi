import { HistoryDashboard } from "./components/history-dashboard";
import { loadSharedHistory } from "@/lib/history";

export const dynamic = "force-dynamic";

export default async function Page() {
  const history = await loadSharedHistory();
  if (!history.ok) {
    return (
      <main className="dash">
        <p className="eyebrow">打歌2026·X舞台 · 鲜打专区 · 第9期</p>
        <h1>安崎 / 黄灿灿 公开榜票仓</h1>
        <p className="lede">只读共享原库 https://votes.alan0828.cloud/api/state，不是迁库。</p>
        <p className="alert">历史数据暂时读不到：{history.error}。不使用模拟数字填补。</p>
      </main>
    );
  }
  return <HistoryDashboard history={history} />;
}

import {
  cellOrGap,
  displayCount,
  displayRank,
  formatShanghai,
  originLabel,
  platformCell,
  type HistoryPayload,
} from "@/lib/history";
import { TrendChart } from "./trend-chart";

function Delta({ value }: { value: number | null | undefined }) {
  if (value == null) return <span className="muted">尚无对比</span>;
  const cls = value > 0 ? "up" : value < 0 ? "down" : "";
  const text = value > 0 ? `+${value.toLocaleString("zh-CN")}` : value.toLocaleString("zh-CN");
  return <span className={cls}>{text}</span>;
}

export function HistoryDashboard({ history }: { history: HistoryPayload }) {
  const { edition, counts, collector, artists, timeline, architecture } = history;

  return (
    <main className="dash">
      <header>
        <p className="eyebrow">
          {edition.show || "打歌2026·X舞台"} · {edition.zone || "鲜打专区"}
          {edition.term ? ` · ${edition.term}` : ""}
        </p>
        <h1>安崎 / 黄灿灿 公开榜票仓</h1>
        <p className="lede">
          只追踪这两人。页面只读共享原库 <code>{architecture.source}</code>
          ，<strong>不是迁库、不是复制搬库</strong>。分项缺失显示「未提供」，某一源时间缺样本显示「缺口」，都不会写成 0。历史人工观测会标明非实时。
        </p>
        <p className="meta">
          本页刷新 {history.fetchedAtBeijing}（北京时间）· 源时间 {counts.sourceFrom ? formatShanghai(counts.sourceFrom) : "—"} →{" "}
          {counts.sourceTo ? formatShanghai(counts.sourceTo) : "—"} · 快照 {counts.snapshots} 条（黄灿灿 {counts.huangcancan} / 安崎{" "}
          {counts.anqi}）· {counts.sourceTimes} 个源时间 · 三端全数字 {counts.platformsAllNumeric} / 全未提供 {counts.platformsAllNull}
        </p>
        <p className="meta">
          采集侧最近成功 {collector.lastSuccessAt ? formatShanghai(collector.lastSuccessAt) : "未提供"}
          {collector.lastKind ? ` · ${collector.lastKind}` : ""}
          {collector.cadenceMinutes ? ` · 约每 ${collector.cadenceMinutes} 分钟` : ""}
          。旧 API 无浏览器 CORS，本页由服务端只读拉取。计数以线上实时为准。
        </p>
      </header>

      <section className="cards" aria-label="当前样本">
        {artists.map((artist) => {
          const latest = artist.latest;
          const live = latest?.liveCollector === true;
          return (
            <article key={artist.artistId} className={`card ${artist.artistId}`}>
              <div className="card-top">
                <div>
                  <p className="muted">{artist.songTitle || "歌曲未核验"}</p>
                  <h2>{artist.displayName}</h2>
                </div>
                <span className={`badge ${live ? "live" : "hist"}`}>
                  {latest ? originLabel(latest.origin, latest.liveCollector) : "尚无样本"}
                </span>
              </div>
              <dl className="stats">
                <div>
                  <dt>总票</dt>
                  <dd>{latest ? displayCount(latest.total) : "缺口"}</dd>
                  <Delta value={artist.deltas?.total} />
                </div>
                <div>
                  <dt>排名</dt>
                  <dd>{latest ? displayRank(latest.rank) : "缺口"}</dd>
                  <p className="muted">样本 {artist.sampleCount} 条</p>
                </div>
                <div>
                  <dt>ai荔枝</dt>
                  <dd>{latest ? displayCount(latest.platforms.aiLizhi) : "缺口"}</dd>
                </div>
                <div>
                  <dt>酷狗</dt>
                  <dd>{latest ? displayCount(latest.platforms.kugou) : "缺口"}</dd>
                </div>
                <div>
                  <dt>QQ音乐</dt>
                  <dd>{latest ? displayCount(latest.platforms.qqMusic) : "缺口"}</dd>
                </div>
              </dl>
              <p className="muted">
                源站 {artist.freshness?.sourceUpdated || (latest ? formatShanghai(latest.sourceDisplayedUpdatedAt) : "未提供")} · 采集{" "}
                {artist.freshness?.collected || (latest ? formatShanghai(latest.collectedAt) : "未提供")}
                {latest?.provenance.observer ? ` · ${latest.provenance.observer}` : ""}
              </p>
            </article>
          );
        })}
      </section>

      <section>
        <h2>历史趋势 · 总票</h2>
        <p className="muted">按源站更新时间排列。没有样本的点不连线，不用前后值填。分项同样不跨时间拼接。</p>
        <TrendChart timeline={timeline} />
      </section>

      {history.collectionGaps.length > 0 ? (
        <section>
          <h2>采集缺口（未入库）</h2>
          <p className="muted">这些是采集失败留下的缺口，不是票数，不会写成 0，也不会用邻时样本填上。</p>
          <ul className="gaps">
            {history.collectionGaps.map((gap) => (
              <li key={gap.id || `${gap.at}-${gap.kind}`}>
                {gap.at ? formatShanghai(gap.at) : "时间未提供"} · {gap.kind || "gap"} · {gap.message || "未入库"}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section>
        <h2>历史明细</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>源站时间</th>
                <th>安崎总票</th>
                <th>安崎排名</th>
                <th>安崎 ai荔枝</th>
                <th>安崎酷狗</th>
                <th>安崎QQ</th>
                <th>安崎出处</th>
                <th>灿灿总票</th>
                <th>灿灿排名</th>
                <th>灿灿 ai荔枝</th>
                <th>灿灿酷狗</th>
                <th>灿灿QQ</th>
                <th>灿灿出处</th>
                <th>采集时间</th>
              </tr>
            </thead>
            <tbody>
              {timeline.length === 0 ? (
                <tr>
                  <td colSpan={14}>尚无历史快照。</td>
                </tr>
              ) : (
                timeline.map((row) => {
                  const collected =
                    [row.huangcancan?.collectedAt, row.anqi?.collectedAt].filter(Boolean).sort().at(-1) || null;
                  return (
                    <tr key={row.sourceDisplayedUpdatedAt}>
                      <td>{row.sourceLabel}</td>
                      <td>{cellOrGap(row.anqi, "total")}</td>
                      <td>{cellOrGap(row.anqi, "rank")}</td>
                      <td>{platformCell(row.anqi, "aiLizhi")}</td>
                      <td>{platformCell(row.anqi, "kugou")}</td>
                      <td>{platformCell(row.anqi, "qqMusic")}</td>
                      <td>{row.anqi ? originLabel(row.anqi.origin, row.anqi.liveCollector) : "缺口"}</td>
                      <td>{cellOrGap(row.huangcancan, "total")}</td>
                      <td>{cellOrGap(row.huangcancan, "rank")}</td>
                      <td>{platformCell(row.huangcancan, "aiLizhi")}</td>
                      <td>{platformCell(row.huangcancan, "kugou")}</td>
                      <td>{platformCell(row.huangcancan, "qqMusic")}</td>
                      <td>{row.huangcancan ? originLabel(row.huangcancan.origin, row.huangcancan.liveCollector) : "缺口"}</td>
                      <td>{formatShanghai(collected) || "未提供"}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>

      <footer>
        <p className="muted">
          自动采集仍走原 <code>POST /api/probe</code>（鉴权与 URL 不变）。本页不展示令牌，也不改 votes / SuperLIVE / DNS。
        </p>
      </footer>
    </main>
  );
}

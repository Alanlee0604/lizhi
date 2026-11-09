import {
  cellOrGap,
  displayCount,
  displayRank,
  formatShanghai,
  originLabel,
  platformCell,
  type HistoryPayload,
} from "@/lib/history";
import { OBSERVATION_CADENCE_MINUTES } from "@/lib/observations";
import { TrendChart } from "./trend-chart";

function Delta({ value }: { value: number | null | undefined }) {
  if (value == null) return <span className="muted">尚无对比</span>;
  const cls = value > 0 ? "up" : value < 0 ? "down" : "";
  const text = value > 0 ? `+${value.toLocaleString("zh-CN")}` : value.toLocaleString("zh-CN");
  return <span className={cls}>{text}</span>;
}

export function HistoryDashboard({ history }: { history: HistoryPayload }) {
  const { edition, counts, collector, artists, timeline, observations, architecture, observationRetention } = history;

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
          ，<strong>不是迁库、不是复制搬库</strong>。折线横轴是<strong>检查时间（约每 {OBSERVATION_CADENCE_MINUTES}{" "}
          分钟）</strong>，与<strong>源站更新时间（目前约 10 分钟一跳）</strong>不是同一件事。分项缺失显示「未提供」，缺检查显示「缺口」，都不会写成 0。
        </p>
        <p className="meta">
          本页刷新 {history.fetchedAtBeijing}（北京时间）· 检查 {counts.observations} 轮（
          {counts.observationFrom ? formatShanghai(counts.observationFrom) : "—"} →{" "}
          {counts.observationTo ? formatShanghai(counts.observationTo) : "—"}）· 源去重快照 {counts.snapshots} 条 / {counts.sourceTimes}{" "}
          个源时间 · 旧 API 本窗 attempts {counts.attemptsReturned} 条
        </p>
        <p className="meta">
          采集频次约每 {OBSERVATION_CADENCE_MINUTES} 分钟（attempt.at）。源库 collector 自报
          {collector.cadenceMinutes ? `约每 ${collector.cadenceMinutes} 分钟` : "未提供"}，那是源站/旧采集字段，不是本图横轴。最近成功{" "}
          {collector.lastSuccessAt ? formatShanghai(collector.lastSuccessAt) : "未提供"}
          {collector.lastKind ? ` · ${collector.lastKind}` : ""}。{observationRetention.note}
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
        <h2>历史趋势（2 分钟检查）</h2>
        <p className="muted">
          按检查时间排列，同一源更新时间的重复 200 检查仍保留该轮票数。可勾选实际总票 / 爱荔枝 / 酷狗 / QQ音乐。历史 attempts
          若无 obsj 则三端为未提供，不从后来快照回填。失败/null 断线，不画成 0。
        </p>
        <TrendChart observations={observations} />
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
        <h2>2 分钟观测明细</h2>
        <p className="muted">每一行是一次检查（attempt.at）。「源未更新」表示源站时间与上一轮相同，票数仍是该轮 rawExcerpt 实读。</p>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>检查时间</th>
                <th>源更新时间</th>
                <th>源站</th>
                <th>安崎总票</th>
                <th>安崎 ai荔枝</th>
                <th>安崎酷狗</th>
                <th>安崎QQ</th>
                <th>灿灿总票</th>
                <th>灿灿 ai荔枝</th>
                <th>灿灿酷狗</th>
                <th>灿灿QQ</th>
              </tr>
            </thead>
            <tbody>
              {observations.length === 0 ? (
                <tr>
                  <td colSpan={11}>当前 attempts 窗口没有可解析的检查观测。</td>
                </tr>
              ) : (
                observations.map((row) => (
                  <tr key={row.collectedAt}>
                    <td>{row.collectedLabel}</td>
                    <td>{row.sourceLabel || "未提供"}</td>
                    <td>{row.sourceUnchanged ? "未更新" : "已更新"}</td>
                    <td>{cellOrGap(row.anqi, "total")}</td>
                    <td>{platformCell(row.anqi, "aiLizhi")}</td>
                    <td>{platformCell(row.anqi, "kugou")}</td>
                    <td>{platformCell(row.anqi, "qqMusic")}</td>
                    <td>{cellOrGap(row.huangcancan, "total")}</td>
                    <td>{platformCell(row.huangcancan, "aiLizhi")}</td>
                    <td>{platformCell(row.huangcancan, "kugou")}</td>
                    <td>{platformCell(row.huangcancan, "qqMusic")}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2>源站去重快照（约 10 分钟）</h2>
        <p className="muted">旧库 UNIQUE(artist, sourceDisplayedUpdatedAt)。相同源时间只留一条，不是 2 分钟观测轴。</p>
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

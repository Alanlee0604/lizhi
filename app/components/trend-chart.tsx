import type { TimelineRow } from "@/lib/history";

const WIDTH = 720;
const HEIGHT = 160;
const PAD = 28;

function pathFor(values: Array<number | null>, min: number, span: number, n: number): string {
  let d = "";
  let drawing = false;
  values.forEach((value, index) => {
    if (value == null) {
      drawing = false;
      return;
    }
    const x = PAD + (n <= 1 ? 0 : (index / (n - 1)) * (WIDTH - 2 * PAD));
    const y = PAD + (1 - (value - min) / span) * (HEIGHT - 2 * PAD);
    d += `${drawing ? " L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`;
    drawing = true;
  });
  return d;
}

export function TrendChart({ timeline }: { timeline: TimelineRow[] }) {
  const chronological = [...timeline].reverse();
  const n = Math.max(1, chronological.length);
  const anqi = chronological.map((row) => row.anqi?.total ?? null);
  const cancan = chronological.map((row) => row.huangcancan?.total ?? null);
  const nums = [...anqi, ...cancan].filter((value): value is number => value != null);
  if (nums.length === 0) {
    return <p className="muted">尚无已入库时间点，趋势保持缺口。</p>;
  }
  const min = Math.min(...nums);
  const max = Math.max(...nums);
  const span = Math.max(1, max - min);
  const labels = [chronological[0], chronological[Math.floor((n - 1) / 2)], chronological[n - 1]]
    .filter(Boolean)
    .map((row) => row.sourceLabel);

  return (
    <figure className="chart">
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} width="100%" height={HEIGHT} role="img" aria-label="两人总票历史趋势，缺失源时间不连线">
        <path d={pathFor(cancan, min, span, n)} fill="none" stroke="#f9a8d4" strokeWidth="2" />
        <path d={pathFor(anqi, min, span, n)} fill="none" stroke="#7dd3fc" strokeWidth="2" />
        {chronological.map((row, index) => {
          const x = PAD + (n <= 1 ? 0 : (index / (n - 1)) * (WIDTH - 2 * PAD));
          const dots = [];
          if (row.huangcancan?.total != null) {
            const y = PAD + (1 - (row.huangcancan.total - min) / span) * (HEIGHT - 2 * PAD);
            dots.push(<circle key={`${row.sourceDisplayedUpdatedAt}-c`} cx={x} cy={y} r="3" fill="#f9a8d4" />);
          }
          if (row.anqi?.total != null) {
            const y = PAD + (1 - (row.anqi.total - min) / span) * (HEIGHT - 2 * PAD);
            dots.push(<circle key={`${row.sourceDisplayedUpdatedAt}-a`} cx={x} cy={y} r="3" fill="#7dd3fc" />);
          }
          return dots;
        })}
      </svg>
      <figcaption className="muted">
        粉=黄灿灿，青=安崎。横轴是源站更新时间；某一侧没有样本就是缺口，不把另一人的票或分项拼过来。
        {labels.length ? ` 范围 ${labels[0]} → ${labels[labels.length - 1]}。` : ""}
      </figcaption>
    </figure>
  );
}

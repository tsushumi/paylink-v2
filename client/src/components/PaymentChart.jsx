import { kes } from '../api';

const short = (n) => (n >= 1000 ? `${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)}k` : String(n));

function BarChart({ data }) {
  const max = Math.max(...data.map((d) => d.total), 1);
  return (
    <div className="chart" role="img" aria-label="Bar chart of daily revenue for the last 7 days">
      {data.map((day) => (
        <div className="col" key={day.date} title={`${day.date}: ${kes(day.total)} (${day.count} payment${day.count === 1 ? '' : 's'})`}>
          <span className="bar-value">{day.total > 0 ? short(day.total) : ''}</span>
          <div className="bar-wrap">
            <div className="bar" style={{ height: `${(day.total / max) * 100}%`, minHeight: day.total > 0 ? 4 : 0 }} />
          </div>
          <span className="bar-label">{day.label}</span>
        </div>
      ))}
    </div>
  );
}

// Area/line chart of the same series, drawn as inline SVG (no chart library needed).
function AreaChart({ data }) {
  const W = 320;
  const H = 150;
  const pad = { l: 8, r: 8, t: 14, b: 4 };
  const max = Math.max(...data.map((d) => d.total), 1);
  const x = (i) => pad.l + (i * (W - pad.l - pad.r)) / (data.length - 1);
  const y = (v) => pad.t + (1 - v / max) * (H - pad.t - pad.b);
  const pts = data.map((d, i) => [x(i), y(d.total)]);
  const line = pts.map(([px, py], i) => `${i ? 'L' : 'M'}${px.toFixed(1)},${py.toFixed(1)}`).join(' ');
  const area = `${line} L${x(data.length - 1).toFixed(1)},${H - pad.b} L${x(0).toFixed(1)},${H - pad.b} Z`;

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="area" role="img" aria-label="Area chart of daily revenue for the last 7 days" preserveAspectRatio="none">
        <defs>
          <linearGradient id="areaFill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="var(--blue)" stopOpacity="0.35" />
            <stop offset="100%" stopColor="var(--blue)" stopOpacity="0.02" />
          </linearGradient>
        </defs>
        {[0.25, 0.5, 0.75].map((f) => (
          <line key={f} x1={pad.l} x2={W - pad.r} y1={pad.t + f * (H - pad.t - pad.b)} y2={pad.t + f * (H - pad.t - pad.b)} stroke="var(--line)" strokeWidth="1" />
        ))}
        <path d={area} fill="url(#areaFill)" />
        <path d={line} fill="none" stroke="var(--blue)" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        {pts.map(([px, py], i) => (
          <circle key={data[i].date} cx={px} cy={py} r="3.5" fill="var(--card)" stroke="var(--blue)" strokeWidth="2" vectorEffect="non-scaling-stroke">
            <title>{`${data[i].date}: ${kes(data[i].total)}`}</title>
          </circle>
        ))}
      </svg>
      <div className="area-labels">
        {data.map((d) => (
          <span key={d.date}>{d.label}</span>
        ))}
      </div>
    </div>
  );
}

export default function PaymentChart({ data }) {
  const hasData = data.some((d) => d.total > 0);
  const total = data.reduce((s, d) => s + d.total, 0);
  return (
    <div className="charts">
      <div className="card">
        <h3>Revenue - last 7 days</h3>
        <p className="muted small chart-sub">{hasData ? `${kes(total)} over the week` : 'No completed payments in the last 7 days yet.'}</p>
        <BarChart data={data} />
      </div>
      <div className="card">
        <h3>Revenue trend</h3>
        <p className="muted small chart-sub">Daily totals, same 7 days</p>
        <AreaChart data={data} />
      </div>
    </div>
  );
}

interface DonutSegment {
  label: string;
  value: number;
  color: string;
}

export function AttendanceDonut({
  segments,
  centerLabel,
  size = 160,
  thickness = 22,
}: {
  segments: DonutSegment[];
  centerLabel: string;
  size?: number;
  thickness?: number;
}) {
  const total = segments.reduce((sum, s) => sum + s.value, 0) || 1;
  const radius = (size - thickness) / 2;
  const circumference = 2 * Math.PI * radius;
  let cumulative = 0;

  return (
    <div className="flex flex-col items-center gap-5">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="shrink-0">
        <g transform={`translate(${size / 2}, ${size / 2}) rotate(-90)`}>
          <circle r={radius} fill="none" stroke="var(--line-soft)" strokeWidth={thickness} />
          {segments.map((s, i) => {
            const frac = s.value / total;
            const length = Math.max(frac * circumference - 1.5, 0); // 1.5px gap between segments
            const dashArray = `${length} ${circumference - length}`;
            const dashOffset = -cumulative;
            cumulative += frac * circumference;
            return (
              <circle
                key={i}
                r={radius}
                fill="none"
                stroke={s.color}
                strokeWidth={thickness}
                strokeDasharray={dashArray}
                strokeDashoffset={dashOffset}
                strokeLinecap="butt"
              />
            );
          })}
        </g>
        <text
          x="50%"
          y="47%"
          textAnchor="middle"
          className="font-display"
          style={{ fill: 'var(--ink)', fontSize: 26, fontWeight: 600 }}
        >
          {total}
        </text>
        <text
          x="50%"
          y="63%"
          textAnchor="middle"
          className="font-mono"
          style={{ fill: 'var(--text-muted)', fontSize: 9, letterSpacing: '0.08em' }}
        >
          {centerLabel.toUpperCase()}
        </text>
      </svg>

      <ul className="space-y-2.5">
        {segments.map((s, i) => (
          <li key={i} className="flex items-center justify-center gap-2.5 text-sm">
            <span className="h-2.5 w-2.5 shrink-0" style={{ background: s.color, borderRadius: '1px' }} />
            <span style={{ color: 'var(--text-secondary)' }}>{s.label}</span>
            <span className="font-mono ml-1 text-xs" style={{ color: 'var(--text-muted)' }}>
              {s.value} · {Math.round((s.value / total) * 100)}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export type { DonutSegment };

import { useMemo } from 'react';
import { CartesianGrid, Line, LineChart, ReferenceArea, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { format } from 'date-fns';
import type { Reading } from '@/lib/types';
import { fmtTemp } from '@/lib/format';

const GAP_MS = 60 * 60 * 1000;

/** Only actual readings are plotted. A gap of more than 60 minutes inserts a null point so the line breaks. */
export function buildSeries(readings: Reading[]) {
  const sorted = [...readings].sort((a, b) => +new Date(a.recorded_at) - +new Date(b.recorded_at));
  const out: { t: number; temp: number | null }[] = [];
  let gaps = 0;
  sorted.forEach((r, i) => {
    const t = +new Date(r.recorded_at);
    if (i > 0) {
      const prev = +new Date(sorted[i - 1].recorded_at);
      if (t - prev > GAP_MS) { out.push({ t: prev + 1, temp: null }); gaps++; }
    }
    out.push({ t, temp: r.temp_c });
  });
  return { data: out, gaps };
}

export function TempChart({ readings, range }: { readings: Reading[]; range: [number, number] }) {
  const { data, gaps } = useMemo(() => buildSeries(readings), [readings]);
  const temps = readings.map((r) => r.temp_c);
  const lo = Math.min(range[0], ...temps) - 2;
  const hi = Math.max(range[1], ...temps) + 2;
  return (
    <figure data-testid="chart-temperature">
      <div className="h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: -12 }}>
            <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="2 4" vertical={false} />
            <ReferenceArea y1={range[0]} y2={range[1]} fill="hsl(var(--primary))" fillOpacity={0.08} stroke="hsl(var(--primary))" strokeOpacity={0.25} strokeDasharray="4 4" />
            <XAxis dataKey="t" type="number" scale="time" domain={['dataMin', 'dataMax']} tickFormatter={(v) => format(v, 'HH:mm')}
              tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))', fontFamily: 'JetBrains Mono' }} stroke="hsl(var(--border))" minTickGap={28} />
            <YAxis domain={[Math.floor(lo), Math.ceil(hi)]} tickFormatter={(v) => v + '°'} width={44}
              tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))', fontFamily: 'JetBrains Mono' }} stroke="hsl(var(--border))" />
            <Tooltip
              contentStyle={{ background: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }}
              labelFormatter={(v) => format(Number(v), 'd MMM, HH:mm')}
              formatter={(v) => [v === null ? 'gap' : fmtTemp(Number(v)), 'Temperature']} />
            <Line type="monotone" dataKey="temp" connectNulls={false} stroke="hsl(var(--chart-1))" strokeWidth={2.25}
              dot={{ r: 2.5, fill: 'hsl(var(--chart-1))', strokeWidth: 0 }} activeDot={{ r: 5, fill: 'hsl(var(--thaw))' }} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <figcaption className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-4 rounded-sm border border-dashed border-primary/50 bg-primary/10" />Safe band {fmtTemp(range[0])} to {fmtTemp(range[1])}</span>
        <span>{readings.length} actual readings (latest 24)</span>
        {gaps > 0 && <span className="font-semibold text-amber">{gaps} gap{gaps > 1 ? 's' : ''} over 60 min - line broken, nothing interpolated</span>}
      </figcaption>
    </figure>
  );
}

import { useState, useEffect } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import api from '../../lib/api';
import type { DailySummary as DailySummaryType } from '../../types/robot';

function KPICard({ label, value, unit, change, positive, color }: {
  label: string; value: string | number; unit?: string; change?: number; positive?: boolean; color?: string
}) {
  const accentColor = color || '#00d4ff';
  return (
    <div className="bg-[#12121a] rounded-xl p-6 border border-white/[0.04] hover:border-white/[0.08] transition-all duration-300 group hover:scale-[1.02]"
         style={{ boxShadow: `0 0 20px ${accentColor}08` }}>
      <p className="text-[10px] text-[#606070] uppercase tracking-[0.15em] mb-3">{label}</p>
      <div className="flex items-baseline gap-2">
        <span className="text-5xl font-extralight text-white tabular-nums group-hover:text-glow-white transition-all"
              style={{ textShadow: `0 0 30px ${accentColor}25` }}>
          {value}
        </span>
        {unit && <span className="text-sm text-[#606070] uppercase font-medium">{unit}</span>}
      </div>
      {change !== undefined && (
        <div className={`flex items-center gap-2 mt-3 text-xs`}>
          <span style={{ color: positive ? '#00ff88' : '#ff3b3b', textShadow: `0 0 8px ${positive ? '#00ff88' : '#ff3b3b'}30` }}>
            {change > 0 ? '↑' : '↓'} {Math.abs(change)}{unit === 'min' ? ' min' : '%'}
          </span>
          <span className="text-[#606070]">vs yesterday</span>
        </div>
      )}
    </div>
  );
}

export default function DailySummary() {
  const [data, setData] = useState<DailySummaryType | null>(null);

  useEffect(() => {
    const load = () => { api.get('/analytics/summary').then(({ data }) => setData(data)).catch(console.error); };
    load();
    const interval = setInterval(load, 10000);
    return () => clearInterval(interval);
  }, []);

  if (!data) return (
    <div className="grid grid-cols-4 gap-4">
      {[...Array(4)].map((_, i) => (
        <div key={i} className="h-32 rounded-xl shimmer" />
      ))}
    </div>
  );

  const chartData = Object.entries(data.tasks_by_hour)
    .map(([hour, count]) => ({ hour: `${hour}:00`, count }))
    .sort((a, b) => parseInt(a.hour) - parseInt(b.hour));

  return (
    <div className="space-y-8">
      <h2 className="text-[10px] text-[#606070] uppercase tracking-[0.2em]">Today's Performance</h2>

      {/* KPI Cards */}
      <div className="grid grid-cols-4 gap-4">
        <KPICard label="Tasks Completed" value={data.total_tasks} color="#00ff88"
                 change={data.tasks_change_percent} positive={data.tasks_change_percent > 0} />
        <KPICard label="Distance" value={data.total_distance_km} unit="km" color="#00d4ff"
                 change={data.distance_change_percent} positive={data.distance_change_percent > 0} />
        <KPICard label="Avg Task Time" value={data.avg_task_time_min} unit="min" color="#ffb800"
                 change={data.time_change_min} positive={data.time_change_min < 0} />
        <KPICard label="Uptime" value={data.uptime_percent} unit="%" color="#8b5cf6"
                 change={data.uptime_change_percent} positive={data.uptime_change_percent > 0} />
      </div>

      {/* Tasks by Hour */}
      <div>
        <h3 className="text-[10px] text-[#606070] uppercase tracking-[0.15em] mb-4">Tasks by Hour</h3>
        <div className="h-56 bg-[#12121a] rounded-xl border border-white/[0.04] p-5">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData}>
              <XAxis dataKey="hour" tick={{ fill: '#606070', fontSize: 10 }} tickLine={false} axisLine={false} interval={3} />
              <YAxis tick={{ fill: '#606070', fontSize: 10 }} tickLine={false} axisLine={false} width={25} />
              <Tooltip
                contentStyle={{
                  background: '#1a1a25',
                  border: '1px solid rgba(0,212,255,0.2)',
                  borderRadius: '10px',
                  fontSize: '12px',
                  color: '#ffffff',
                  boxShadow: '0 10px 40px rgba(0,0,0,0.5), 0 0 15px rgba(0,212,255,0.1)',
                }}
                labelStyle={{ color: '#a0a0b0' }}
                cursor={{ fill: 'rgba(0,212,255,0.05)' }}
              />
              <Bar dataKey="count" fill="#00d4ff" radius={[3, 3, 0, 0]} opacity={0.6} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Top Errors */}
      <div>
        <h3 className="text-[10px] text-[#606070] uppercase tracking-[0.15em] mb-4">Top Errors Today</h3>
        <div className="space-y-2.5">
          {data.top_errors.length === 0 ? (
            <div className="text-sm text-[#00ff88] text-glow-green flex items-center gap-2">
              <span>✓</span> No errors today — fleet running clean
            </div>
          ) : (
            data.top_errors.map((err, i) => (
              <div key={i} className="flex items-center gap-4 text-sm bg-[#12121a] rounded-lg p-3 border border-white/[0.04] hover:border-white/[0.08] transition-colors">
                <span className="text-[#606070] w-5 text-right tabular-nums text-xs">{i + 1}</span>
                <span className="font-mono text-xs text-[#ff3b3b]" style={{ textShadow: '0 0 8px rgba(255,59,59,0.2)' }}>{err.code}</span>
                <span className="text-[#a0a0b0] flex-1 truncate">{err.name}</span>
                <div className="flex items-center gap-3">
                  <div className="w-16 h-2 bg-[#0a0a0f] rounded-full overflow-hidden">
                    <div className="h-full rounded-full bg-[#ff3b3b]/40 glow-red-sm"
                         style={{ width: `${Math.min(err.count * 12, 100)}%` }} />
                  </div>
                  <span className="text-white tabular-nums text-xs font-medium w-6 text-right">{err.count}</span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

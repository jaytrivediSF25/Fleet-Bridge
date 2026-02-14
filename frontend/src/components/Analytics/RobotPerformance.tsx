import { useState, useEffect } from 'react';
import api from '../../lib/api';
import type { RobotPerformance } from '../../types/robot';

export default function RobotPerformanceView() {
  const [data, setData] = useState<RobotPerformance[]>([]);
  const [sortBy, setSortBy] = useState<'tasks_completed' | 'error_count' | 'uptime_percent'>('tasks_completed');

  useEffect(() => {
    const load = () => { api.get('/analytics/robots').then(({ data }) => setData(data)).catch(console.error); };
    load();
    const interval = setInterval(load, 10000);
    return () => clearInterval(interval);
  }, []);

  const sorted = [...data].sort((a, b) => {
    if (sortBy === 'tasks_completed') return b.tasks_completed - a.tasks_completed;
    if (sortBy === 'error_count') return b.error_count - a.error_count;
    return b.uptime_percent - a.uptime_percent;
  });

  if (data.length === 0) return (
    <div className="space-y-2">
      {[...Array(6)].map((_, i) => <div key={i} className="h-12 rounded-xl shimmer" />)}
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-[10px] text-[#606070] uppercase tracking-[0.2em]">Robot Performance</h2>
        <select
          value={sortBy}
          onChange={e => setSortBy(e.target.value as typeof sortBy)}
          className="bg-[#1a1a25] text-xs text-[#a0a0b0] rounded-lg px-3 py-2 border border-white/[0.06] focus:outline-none focus:border-[#00d4ff]/30 transition-colors"
        >
          <option value="tasks_completed">Sort: Tasks</option>
          <option value="error_count">Sort: Errors</option>
          <option value="uptime_percent">Sort: Uptime</option>
        </select>
      </div>

      <div className="bg-[#12121a] rounded-xl border border-white/[0.04] overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/[0.06]">
              <th className="text-left text-[#606070] px-5 py-4 font-medium text-[10px] uppercase tracking-[0.15em]">Robot</th>
              <th className="text-left text-[#606070] px-5 py-4 font-medium text-[10px] uppercase tracking-[0.15em]">Vendor</th>
              <th className="text-right text-[#606070] px-5 py-4 font-medium text-[10px] uppercase tracking-[0.15em]">Tasks</th>
              <th className="text-right text-[#606070] px-5 py-4 font-medium text-[10px] uppercase tracking-[0.15em]">Errors</th>
              <th className="text-right text-[#606070] px-5 py-4 font-medium text-[10px] uppercase tracking-[0.15em]">Uptime</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((r, i) => (
              <tr key={r.robot_id}
                  className="border-b border-white/[0.03] hover:bg-white/[0.02] transition-colors"
                  style={{ animationDelay: `${i * 30}ms` }}>
                <td className="px-5 py-3">
                  <div className="flex items-center gap-2">
                    <span className="text-white font-mono text-xs">{r.robot_id}</span>
                    {r.is_top_performer && (
                      <span className="text-[10px] text-[#00ff88] font-semibold text-glow-green">★</span>
                    )}
                    {r.needs_attention && (
                      <span className="text-[10px] text-[#ffb800] font-semibold animate-breathing">!</span>
                    )}
                  </div>
                </td>
                <td className="px-5 py-3 text-[#606070] text-xs">{r.vendor.split(' ')[0]}</td>
                <td className="text-right px-5 py-3 text-white tabular-nums font-medium">{r.tasks_completed}</td>
                <td className="text-right px-5 py-3 tabular-nums font-medium"
                    style={{
                      color: r.error_count >= 3 ? '#ff3b3b' : '#a0a0b0',
                      textShadow: r.error_count >= 3 ? '0 0 8px rgba(255,59,59,0.3)' : 'none',
                    }}>
                  {r.error_count}
                </td>
                <td className="text-right px-5 py-3 tabular-nums font-medium"
                    style={{
                      color: r.uptime_percent < 90 ? '#ffb800' : '#00ff88',
                      textShadow: `0 0 8px ${r.uptime_percent < 90 ? '#ffb800' : '#00ff88'}30`,
                    }}>
                  {r.uptime_percent}%
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="text-xs text-[#606070] flex gap-5">
        <span className="flex items-center gap-1.5"><span className="text-[#00ff88] text-glow-green">★</span> Top performer</span>
        <span className="flex items-center gap-1.5"><span className="text-[#ffb800]">!</span> Needs attention</span>
      </div>
    </div>
  );
}

import { useState, useEffect } from 'react';
import api from '../../lib/api';
import { VENDOR_COLORS } from '../../lib/colors';
import type { VendorMetrics } from '../../types/robot';

export default function VendorComparison() {
  const [data, setData] = useState<VendorMetrics[]>([]);

  useEffect(() => {
    const load = () => { api.get('/analytics/vendors').then(({ data }) => setData(data)).catch(console.error); };
    load();
    const interval = setInterval(load, 10000);
    return () => clearInterval(interval);
  }, []);

  if (data.length === 0) return (
    <div className="space-y-4">
      {[...Array(3)].map((_, i) => <div key={i} className="h-20 rounded-xl shimmer" />)}
    </div>
  );

  return (
    <div className="space-y-8">
      <h2 className="text-[10px] text-[#606070] uppercase tracking-[0.2em]">Vendor Comparison</h2>

      {/* Vendor Hero Cards */}
      <div className="grid grid-cols-3 gap-4">
        {data.map(v => {
          const color = VENDOR_COLORS[v.vendor] || '#00d4ff';
          return (
            <div key={v.vendor}
                 className="bg-[#12121a] rounded-xl p-5 border border-white/[0.04] hover:border-white/[0.08] transition-all duration-300 hover:scale-[1.02]"
                 style={{ boxShadow: `0 0 20px ${color}08` }}>
              <div className="flex items-center gap-2 mb-4">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: color, boxShadow: `0 0 8px ${color}` }} />
                <span className="text-sm font-semibold text-white">{v.vendor}</span>
                <span className="text-xs text-[#606070] ml-auto">{v.robot_count} robots</span>
              </div>
              <div className="text-4xl font-extralight text-white tabular-nums mb-1"
                   style={{ textShadow: `0 0 20px ${color}25` }}>
                {v.total_tasks}
              </div>
              <div className="text-xs text-[#606070]">tasks completed</div>
              <div className="mt-3 flex items-center gap-2 text-xs">
                <span className={v.uptime_percent >= 95 ? 'text-[#00ff88]' : 'text-[#ffb800]'}
                      style={{ textShadow: `0 0 8px ${v.uptime_percent >= 95 ? '#00ff88' : '#ffb800'}30` }}>
                  {v.uptime_percent}% uptime
                </span>
                <span className="text-[#606070]">·</span>
                <span className={v.error_rate_percent > 5 ? 'text-[#ff3b3b]' : 'text-[#a0a0b0]'}>
                  {v.error_rate_percent}% errors
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Comparison Table */}
      <div className="bg-[#12121a] rounded-xl border border-white/[0.04] overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/[0.06]">
              <th className="text-left text-[#606070] px-5 py-4 font-medium text-[10px] uppercase tracking-[0.15em]">Metric</th>
              {data.map(v => (
                <th key={v.vendor} className="text-right text-white px-5 py-4 font-semibold text-xs">
                  {v.vendor.split(' ')[0]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="text-[#a0a0b0]">
            {[
              { label: 'Tasks/Robot', key: 'tasks_per_robot' },
              { label: 'Avg Time', key: 'avg_task_time_min', suffix: ' min' },
              { label: 'Errors', key: 'total_errors' },
              { label: 'Error Rate', key: 'error_rate_percent', suffix: '%', warnFn: (v: number) => v > 5 },
              { label: 'Uptime', key: 'uptime_percent', suffix: '%', goodFn: (v: number) => v >= 95 },
              { label: 'Avg Battery', key: 'avg_battery', suffix: '%' },
            ].map(row => (
              <tr key={row.label} className="border-b border-white/[0.03] hover:bg-white/[0.01] transition-colors">
                <td className="px-5 py-3 text-[#606070] text-xs">{row.label}</td>
                {data.map(v => {
                  const val = (v as unknown as Record<string, unknown>)[row.key] as number;
                  let textColor = '#a0a0b0';
                  if (row.warnFn && row.warnFn(val)) textColor = '#ff3b3b';
                  if (row.goodFn && row.goodFn(val)) textColor = '#00ff88';
                  if (row.goodFn && !row.goodFn(val)) textColor = '#ffb800';
                  return (
                    <td key={v.vendor} className="text-right px-5 py-3 tabular-nums text-sm font-medium"
                        style={{ color: textColor, textShadow: textColor !== '#a0a0b0' ? `0 0 8px ${textColor}30` : 'none' }}>
                      {val}{row.suffix || ''}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Uptime Bars */}
      <div>
        <h3 className="text-[10px] text-[#606070] uppercase tracking-[0.15em] mb-4">Uptime</h3>
        <div className="space-y-3">
          {data.map(v => {
            const color = VENDOR_COLORS[v.vendor] || '#00d4ff';
            return (
              <div key={v.vendor} className="flex items-center gap-4 text-sm">
                <span className="w-16 text-[#606070] text-right text-xs truncate">{v.vendor.split(' ')[0]}</span>
                <div className="flex-1 h-3 bg-[#0a0a0f] rounded-full overflow-hidden border border-white/[0.04]">
                  <div className="h-full rounded-full transition-all duration-700"
                       style={{
                         width: `${v.uptime_percent}%`,
                         backgroundColor: color,
                         opacity: 0.5,
                         boxShadow: `0 0 10px ${color}40`,
                       }} />
                </div>
                <span className="w-14 text-white text-right tabular-nums text-xs font-medium"
                      style={{ textShadow: `0 0 8px ${color}30` }}>
                  {v.uptime_percent}%
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

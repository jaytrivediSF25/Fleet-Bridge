import { useState, useEffect } from 'react';
import api from '../../lib/api';
import type { ZoneMetrics } from '../../types/robot';

const HEAT_COLORS: Record<string, { bg: string; border: string; glow: string }> = {
  low:       { bg: 'rgba(0,212,255,0.03)', border: 'rgba(0,212,255,0.10)', glow: 'none' },
  medium:    { bg: 'rgba(0,255,136,0.05)', border: 'rgba(0,255,136,0.15)', glow: '0 0 12px rgba(0,255,136,0.08)' },
  high:      { bg: 'rgba(255,184,0,0.06)', border: 'rgba(255,184,0,0.20)', glow: '0 0 15px rgba(255,184,0,0.1)' },
  very_high: { bg: 'rgba(255,59,59,0.07)', border: 'rgba(255,59,59,0.25)', glow: '0 0 20px rgba(255,59,59,0.12)' },
};

export default function ZoneAnalysis() {
  const [data, setData] = useState<ZoneMetrics[]>([]);

  useEffect(() => {
    const load = () => { api.get('/analytics/zones').then(({ data }) => setData(data)).catch(console.error); };
    load();
    const interval = setInterval(load, 10000);
    return () => clearInterval(interval);
  }, []);

  if (data.length === 0) return (
    <div className="grid grid-cols-3 gap-3">
      {[...Array(6)].map((_, i) => <div key={i} className="h-24 rounded-xl shimmer" />)}
    </div>
  );

  return (
    <div className="space-y-8">
      <h2 className="text-[10px] text-[#606070] uppercase tracking-[0.2em]">Zone Analysis</h2>

      {/* Heat Map Grid */}
      <div>
        <h3 className="text-[10px] text-[#606070] uppercase tracking-[0.15em] mb-4">Activity Heat Map</h3>
        <div className="grid grid-cols-3 gap-3">
          {data.map(zone => {
            const heat = HEAT_COLORS[zone.activity_level] || HEAT_COLORS.low;
            return (
              <div key={zone.zone}
                   className="rounded-xl p-5 border text-center transition-all duration-300 hover:scale-[1.02]"
                   style={{ backgroundColor: heat.bg, borderColor: heat.border, boxShadow: heat.glow }}>
                <div className="text-xs font-semibold text-[#a0a0b0] mb-2 tracking-wider">{zone.zone}</div>
                <div className="text-3xl font-extralight text-white tabular-nums"
                     style={{ textShadow: zone.activity_level === 'very_high' ? '0 0 15px rgba(255,59,59,0.3)' : '0 0 10px rgba(255,255,255,0.1)' }}>
                  {zone.robot_count}
                </div>
                <div className="text-[11px] text-[#606070] mt-1">robots</div>
                <div className="text-[10px] text-[#606070] mt-2 uppercase tracking-wider">
                  {zone.activity_level.replace('_', ' ')}
                </div>
              </div>
            );
          })}
        </div>
        <div className="flex gap-5 mt-4 text-[11px] text-[#606070] justify-center">
          <span className="flex items-center gap-2"><span className="w-3 h-2 rounded" style={{ background: HEAT_COLORS.low.bg, border: `1px solid ${HEAT_COLORS.low.border}` }} /> Low</span>
          <span className="flex items-center gap-2"><span className="w-3 h-2 rounded" style={{ background: HEAT_COLORS.medium.bg, border: `1px solid ${HEAT_COLORS.medium.border}` }} /> Medium</span>
          <span className="flex items-center gap-2"><span className="w-3 h-2 rounded" style={{ background: HEAT_COLORS.high.bg, border: `1px solid ${HEAT_COLORS.high.border}` }} /> High</span>
          <span className="flex items-center gap-2"><span className="w-3 h-2 rounded" style={{ background: HEAT_COLORS.very_high.bg, border: `1px solid ${HEAT_COLORS.very_high.border}` }} /> Critical</span>
        </div>
      </div>

      {/* Table */}
      <div className="bg-[#12121a] rounded-xl border border-white/[0.04] overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/[0.06]">
              <th className="text-left text-[#606070] px-5 py-4 font-medium text-[10px] uppercase tracking-[0.15em]">Zone</th>
              <th className="text-right text-[#606070] px-5 py-4 font-medium text-[10px] uppercase tracking-[0.15em]">Tasks</th>
              <th className="text-right text-[#606070] px-5 py-4 font-medium text-[10px] uppercase tracking-[0.15em]">Errors</th>
              <th className="text-right text-[#606070] px-5 py-4 font-medium text-[10px] uppercase tracking-[0.15em]">Avg Wait</th>
              <th className="text-right text-[#606070] px-5 py-4 font-medium text-[10px] uppercase tracking-[0.15em]">Robots</th>
            </tr>
          </thead>
          <tbody>
            {data.sort((a, b) => b.task_count - a.task_count).map(zone => (
              <tr key={zone.zone} className="border-b border-white/[0.03] hover:bg-white/[0.02] transition-colors">
                <td className="px-5 py-3 text-white font-medium">{zone.zone}</td>
                <td className="text-right px-5 py-3 text-white tabular-nums">{zone.task_count}</td>
                <td className="text-right px-5 py-3 tabular-nums"
                    style={{
                      color: zone.error_count > 3 ? '#ff3b3b' : '#a0a0b0',
                      textShadow: zone.error_count > 3 ? '0 0 8px rgba(255,59,59,0.3)' : 'none',
                    }}>
                  {zone.error_count}
                </td>
                <td className="text-right px-5 py-3 tabular-nums"
                    style={{
                      color: zone.avg_wait_time_min > 2 ? '#ffb800' : '#a0a0b0',
                      textShadow: zone.avg_wait_time_min > 2 ? '0 0 8px rgba(255,184,0,0.3)' : 'none',
                    }}>
                  {zone.avg_wait_time_min} min
                </td>
                <td className="text-right px-5 py-3 text-white tabular-nums">{zone.robot_count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Insight */}
      {(() => {
        const highWait = data.find(z => z.avg_wait_time_min > 2);
        if (highWait) {
          return (
            <div className="bg-[#12121a] border border-[#ffb800]/20 rounded-xl p-5 text-sm text-[#a0a0b0]"
                 style={{ boxShadow: '0 0 20px rgba(255,184,0,0.08)' }}>
              <span className="text-[#ffb800] text-glow-amber font-semibold">{highWait.zone}</span> has elevated wait times ({highWait.avg_wait_time_min} min). Consider redistributing workloads or adding alternate routes.
            </div>
          );
        }
        return null;
      })()}
    </div>
  );
}

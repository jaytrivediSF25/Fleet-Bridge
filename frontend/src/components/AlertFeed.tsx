import { useState, useMemo } from 'react';
import { useFleet } from '../context/FleetContext';
import { SEVERITY_COLORS, SEVERITY_LABELS } from '../lib/colors';
import api from '../lib/api';
import type { Alert } from '../types/robot';

const FILTER_OPTIONS = [
  { key: 'all',      label: 'All',      color: '#a0a0b0' },
  { key: 'critical', label: 'Critical', color: '#ff3b3b' },
  { key: 'warning',  label: 'Warning',  color: '#ffb800' },
  { key: 'info',     label: 'Info',     color: '#00d4ff' },
];

function AlertCard({ alert, index }: { alert: Alert; index: number }) {
  const { dispatch } = useFleet();
  const [expanded, setExpanded] = useState(false);

  const timeAgo = (ts: string) => {
    const diff = (Date.now() - new Date(ts).getTime()) / 1000;
    if (diff < 60) return `${Math.floor(diff)}s ago`;
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    return `${Math.floor(diff / 3600)}h ago`;
  };

  const color = SEVERITY_COLORS[alert.severity];
  const label = SEVERITY_LABELS[alert.severity];

  return (
    <div
      className={`mx-5 mb-3 rounded-xl border p-5 transition-all duration-300 hover:scale-[1.01] ${
        alert.resolved
          ? 'bg-[#1a1a25]/50 border-white/[0.04] opacity-40'
          : 'bg-[#1a1a25] cursor-pointer'
      }`}
      style={{
        borderColor: alert.resolved ? undefined : `${color}20`,
        boxShadow: alert.resolved ? 'none' : `0 0 20px ${color}10`,
        animationDelay: `${index * 50}ms`,
      }}
    >
      <div className="flex items-start gap-3">
        {/* Pulsing severity dot */}
        <div className="relative mt-1 flex-shrink-0">
          {!alert.resolved && alert.severity === 'critical' && (
            <div className="absolute inset-0 rounded-full ping-glow" style={{ backgroundColor: color }} />
          )}
          <div className={`w-2.5 h-2.5 rounded-full ${!alert.resolved && alert.severity === 'critical' ? 'animate-pulse' : ''}`}
               style={{ backgroundColor: color, boxShadow: `0 0 8px ${color}` }} />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[10px] font-bold uppercase tracking-[0.12em] px-1.5 py-0.5 rounded"
                  style={{ color, backgroundColor: `${color}15` }}>
              {label}
            </span>
            <span className="text-[11px] text-[#606070] ml-auto tabular-nums flex-shrink-0">
              {timeAgo(alert.created_at)}
            </span>
          </div>

          <h3 className="text-sm font-semibold text-white truncate">{alert.title}</h3>
          <p className="text-xs text-[#a0a0b0] mt-1 line-clamp-2 leading-relaxed">{alert.description}</p>

          {expanded && (
            <div className="mt-3 space-y-3 animate-fade-in">
              <div className="text-xs text-[#a0a0b0]">
                <span className="text-white font-medium">Suggested:</span>
                <p className="mt-1 leading-relaxed">{alert.suggested_action}</p>
              </div>
              {alert.rca_analysis && (
                <div className="text-xs bg-[#0a0a0f] rounded-lg p-3 border border-white/[0.04]">
                  <span className="text-[#00d4ff] font-medium text-[10px] uppercase tracking-wider">Root Cause Analysis</span>
                  <pre className="mt-1.5 whitespace-pre-wrap text-[#a0a0b0] font-sans leading-relaxed">{alert.rca_analysis}</pre>
                </div>
              )}
              <div className="text-[11px] text-[#606070]">
                Affected: <span className="text-[#a0a0b0]">{alert.affected_robots.join(', ')}</span>
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3 mt-3">
            <button onClick={() => setExpanded(!expanded)}
              className="text-xs text-[#a0a0b0] hover:text-white transition-colors">
              {expanded ? 'Collapse' : 'Details'}
            </button>
            <button onClick={() => alert.affected_robots[0] && dispatch({ type: 'SELECT_ROBOT', robotId: alert.affected_robots[0] })}
              className="text-xs text-[#a0a0b0] hover:text-[#00d4ff] transition-colors">
              View
            </button>
            {!alert.acknowledged && !alert.resolved && (
              <button onClick={() => api.post(`/alerts/${alert.id}/acknowledge`)}
                className="text-xs text-[#a0a0b0] hover:text-white transition-colors">
                Acknowledge
              </button>
            )}
            {!alert.resolved && (
              <button onClick={() => api.post(`/alerts/${alert.id}/resolve`)}
                className="text-xs font-medium transition-colors hover:brightness-125"
                style={{ color: '#00ff88', textShadow: '0 0 8px rgba(0,255,136,0.3)' }}>
                Resolve
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function AlertFeed() {
  const { state } = useFleet();
  const [severityFilter, setSeverityFilter] = useState('all');

  // Only show unresolved alerts — resolved ones are cleaned up backend-side
  const activeAlerts = useMemo(() => state.alerts.filter(a => !a.resolved), [state.alerts]);

  // Severity counts
  const counts = useMemo(() => ({
    all: activeAlerts.length,
    critical: activeAlerts.filter(a => a.severity === 'critical').length,
    warning: activeAlerts.filter(a => a.severity === 'warning').length,
    info: activeAlerts.filter(a => a.severity === 'info').length,
  }), [activeAlerts]);

  // Filtered alerts
  const filteredAlerts = useMemo(() => {
    if (severityFilter === 'all') return activeAlerts;
    return activeAlerts.filter(a => a.severity === severityFilter);
  }, [activeAlerts, severityFilter]);

  const hasAny = activeAlerts.length > 0;

  // Header dot color = highest severity present
  let dotColor = '#00ff88';
  let dotAnimate = '';
  if (counts.critical > 0) { dotColor = '#ff3b3b'; dotAnimate = 'animate-pulse'; }
  else if (counts.warning > 0) { dotColor = '#ffb800'; }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="px-6 py-4 border-b border-white/[0.06] flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className={`w-2 h-2 rounded-full ${dotAnimate}`}
               style={{ backgroundColor: dotColor, boxShadow: `0 0 8px ${dotColor}` }} />
          <span className="text-sm font-semibold text-white tracking-wide">Alerts</span>
        </div>
        <span className="text-[11px] text-[#606070] tabular-nums flex items-center gap-2.5">
          {counts.critical > 0 && (
            <span className="text-[#ff3b3b] font-bold">{counts.critical} critical</span>
          )}
          <span><span className={hasAny ? 'text-[#ffb800]' : 'text-[#00ff88]'}>{activeAlerts.length}</span> active</span>
        </span>
      </div>

      {/* Severity filter tabs */}
      <div className="px-5 py-3 border-b border-white/[0.06] flex gap-1.5">
        {FILTER_OPTIONS.map(f => (
          <button
            key={f.key}
            onClick={() => setSeverityFilter(f.key)}
            className={`text-[10px] px-2.5 py-1.5 rounded-md border transition-all duration-200 flex items-center gap-1.5 ${
              severityFilter === f.key
                ? 'border-white/[0.15] bg-white/[0.06]'
                : 'border-white/[0.04] hover:border-white/[0.10] hover:bg-white/[0.02]'
            }`}
            style={severityFilter === f.key ? { color: f.color, textShadow: `0 0 8px ${f.color}40` } : { color: '#a0a0b0' }}
          >
            {f.key !== 'all' && (
              <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: f.color }} />
            )}
            {f.label}
            <span className="tabular-nums opacity-60">
              ({counts[f.key as keyof typeof counts] ?? 0})
            </span>
          </button>
        ))}
      </div>

      {/* Alert list */}
      <div className="flex-1 overflow-y-auto py-3">
        {filteredAlerts.length === 0 ? (
          <div className="text-center py-16 space-y-4">
            <div className="w-14 h-14 rounded-xl bg-[#00ff88]/10 border border-[#00ff88]/20 mx-auto flex items-center justify-center glow-green-sm">
              <span className="text-[#00ff88] text-xl text-glow-green">✓</span>
            </div>
            <div className="text-sm text-[#a0a0b0]">
              {severityFilter === 'all'
                ? 'All systems operational'
                : `No ${severityFilter} alerts`}
            </div>
            <div className="text-xs text-[#606070]">
              {severityFilter === 'all'
                ? 'Fleet is running smoothly — no active alerts.'
                : `No active ${severityFilter}-level alerts at this time.`}
            </div>
          </div>
        ) : (
          filteredAlerts.map((alert, i) => <AlertCard key={alert.id} alert={alert} index={i} />)
        )}
      </div>
    </div>
  );
}

import { useMemo, useState, useEffect } from 'react';
import { useFleet } from '../context/FleetContext';
import { STATUS_COLORS, STATUS_GLOW_CSS, STATUS_TEXT_GLOW, VENDOR_INFO } from '../lib/colors';
import api from '../lib/api';

/* ---- Speed display helper ---- */
function formatSpeed(mps: number): string {
  if (mps < 0.01) return '0.0';
  const mph = mps * 2.237;
  return mph.toFixed(1);
}

export default function RobotDetail() {
  const { state, dispatch } = useFleet();
  const robot = useMemo(
    () => state.robots.find(r => r.id === state.selectedRobotId),
    [state.robots, state.selectedRobotId]
  );

  // Remediation steps state
  const [remediation, setRemediation] = useState<{
    code: string; name: string; description: string;
    common_causes: string[]; remediation_steps: string[];
    auto_recoverable: boolean; severity: string;
  } | null>(null);
  const [remLoading, setRemLoading] = useState(false);
  const [checkedSteps, setCheckedSteps] = useState<Set<number>>(new Set());

  // Fetch remediation when error changes
  useEffect(() => {
    if (robot?.last_error && !robot.last_error.resolved) {
      setRemLoading(true);
      setCheckedSteps(new Set());
      api.get(`/errors/${robot.last_error.error_code}/remediation`)
        .then(({ data }) => setRemediation(data))
        .catch(() => setRemediation(null))
        .finally(() => setRemLoading(false));
    } else {
      setRemediation(null);
      setCheckedSteps(new Set());
    }
  }, [robot?.last_error?.error_code, robot?.last_error?.resolved]);

  if (!robot) return null;

  const sendCommand = async (command: string, extra?: Record<string, string>) => {
    try {
      const payload: Record<string, string> = { command, ...extra };
      const { data } = await api.post(`/robots/${robot.id}/command`, payload);

      // If it's a send_to_charging command and we got back the target, set charge path
      if (command === 'send_to_charging' && data.charging_target) {
        dispatch({
          type: 'SET_CHARGE_PATH',
          path: {
            robotId: robot.id,
            from: data.robot_position,
            to: { x: data.charging_target.x, y: data.charging_target.y },
            chargerName: data.charging_target.name,
          },
        });
      }
    } catch (e) { console.error(e); }
  };

  const timeAgo = (ts: string) => {
    const diff = (Date.now() - new Date(ts).getTime()) / 1000;
    if (diff < 60) return `${Math.floor(diff)}s ago`;
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    return `${Math.floor(diff / 3600)}h ago`;
  };

  const color = STATUS_COLORS[robot.status];
  const glowClass = STATUS_GLOW_CSS[robot.status];
  const textGlowClass = STATUS_TEXT_GLOW[robot.status];
  const batteryHours = (robot.battery / 100 * 5.8).toFixed(1);
  const vendorInfo = VENDOR_INFO[robot.vendor] || VENDOR_INFO['Gemini'];
  const isCharging = robot.status === 'charging';
  const batColor = isCharging ? '#3b82f6' : robot.battery > 50 ? '#00ff88' : robot.battery > 20 ? '#ffb800' : '#ff3b3b';
  const batGlow = isCharging ? 'glow-blue-sm charge-pulse' : robot.battery > 50 ? 'glow-green-sm' : robot.battery > 20 ? 'glow-amber-sm' : 'glow-red-sm';
  const allStepsChecked = remediation ? checkedSteps.size >= remediation.remediation_steps.length : false;

  const toggleStep = (idx: number) => {
    setCheckedSteps(prev => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  return (
    <div className="h-full flex flex-col animate-slide-in overflow-hidden">
      {/* Close */}
      <div className="px-6 py-4 border-b border-white/[0.06] flex items-center justify-between">
        <button
          onClick={() => dispatch({ type: 'SET_SHOW_ROBOT_DETAIL', show: false })}
          className="text-xs text-[#606070] hover:text-[#a0a0b0] transition-colors flex items-center gap-1.5"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
          Back
        </button>
      </div>

      {/* Robot hero header */}
      <div className="px-6 py-6 border-b border-white/[0.06] flex flex-col items-center text-center relative overflow-hidden">
        {/* Background glow */}
        <div className="absolute inset-0 opacity-20"
             style={{ background: `radial-gradient(ellipse at center, ${color}20 0%, transparent 70%)` }} />

        <div className="relative mb-4">
          {/* Glow ring */}
          <div className="absolute -inset-3 rounded-full opacity-30 blur-xl"
               style={{ backgroundColor: color }} />
          <div className={`relative w-18 h-18 rounded-full flex items-center justify-center border-2 ${glowClass}`}
               style={{ borderColor: color, backgroundColor: `${color}15`, width: 72, height: 72 }}>
            <span className="text-sm font-bold text-white/80 uppercase tracking-wider">{vendorInfo.short}</span>
          </div>
          {/* Status pulse */}
          <span className={`absolute -bottom-1 -right-1 w-5 h-5 rounded-full border-2 border-[#12121a]`}
                style={{ backgroundColor: color, boxShadow: `0 0 10px ${color}` }} />
        </div>

        <h2 className={`text-xl font-bold text-white tracking-wide ${textGlowClass}`}>{robot.id}</h2>
        <p className="text-xs text-[#606070] mt-1">{robot.vendor} · {robot.model}</p>

        <span className="mt-3 text-[11px] font-bold uppercase tracking-[0.15em] px-3 py-1 rounded-lg"
              style={{ color, backgroundColor: `${color}15`, boxShadow: `0 0 12px ${color}25` }}>
          {robot.status}
        </span>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
        {/* Color code legend */}
        <section>
          <h3 className="text-[10px] text-[#606070] uppercase tracking-[0.15em] mb-3">Color Code</h3>
          <div className="bg-[#1a1a25] rounded-xl p-4 border border-white/[0.04] space-y-2.5">
            {/* This robot's vendor color */}
            <div className="flex items-center gap-2.5">
              <span className="w-3 h-3 rounded-full flex-shrink-0"
                    style={{ backgroundColor: vendorInfo.color, boxShadow: `0 0 8px ${vendorInfo.color}60` }} />
              <span className="text-xs text-white font-medium">{vendorInfo.label}</span>
              <span className="text-[10px] text-[#606070] ml-auto">{vendorInfo.desc}</span>
            </div>
            <div className="border-t border-white/[0.04] pt-2">
              <div className="text-[9px] text-[#606070] uppercase tracking-wider mb-1.5">All Vendor Colors</div>
              <div className="flex gap-3">
                {Object.values(VENDOR_INFO).map(v => (
                  <div key={v.short} className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full"
                          style={{ backgroundColor: v.color, boxShadow: `0 0 6px ${v.color}50` }} />
                    <span className={`text-[10px] ${v.color === vendorInfo.color ? 'text-white font-semibold' : 'text-[#606070]'}`}>
                      {v.short}
                    </span>
                  </div>
                ))}
              </div>
            </div>
            {/* Status color */}
            <div className="border-t border-white/[0.04] pt-2 flex items-center gap-2.5">
              <span className="w-3 h-3 rounded-full flex-shrink-0"
                    style={{ backgroundColor: color, boxShadow: `0 0 8px ${color}60` }} />
              <span className="text-xs text-[#a0a0b0]">Status: <span className="text-white capitalize">{robot.status}</span></span>
            </div>
          </div>
        </section>

        {/* Battery — big display */}
        <section>
          <h3 className="text-[10px] text-[#606070] uppercase tracking-[0.15em] mb-3">Battery</h3>
          <div className="flex items-center gap-4 mb-2">
            <div className="flex-1 h-3 bg-[#1a1a25] rounded-full overflow-hidden border border-white/[0.04] relative">
              <div className={`h-full rounded-full transition-all duration-700 ${batGlow}`}
                   style={{ width: `${robot.battery}%`, backgroundColor: batColor }} />
              {isCharging && (
                <div className="absolute inset-0 rounded-full overflow-hidden">
                  <div className="h-full rounded-full"
                       style={{
                         width: `${robot.battery}%`,
                         background: `linear-gradient(90deg, ${batColor}00 60%, ${batColor}90 100%)`,
                         animation: 'charge-shimmer 2s ease-in-out infinite',
                       }} />
                </div>
              )}
            </div>
            <span className="text-2xl font-extralight text-white tabular-nums"
                  style={{ textShadow: `0 0 15px ${batColor}40` }}>
              {robot.battery.toFixed(0)}%
            </span>
          </div>
          <p className="text-[11px] text-[#606070]">
            {isCharging
              ? <span className="text-[#3b82f6]" style={{ textShadow: '0 0 8px rgba(59,130,246,0.4)' }}>⚡ Charging</span>
              : `~${batteryHours} hours remaining`
            }
          </p>
        </section>

        {/* Location — stat grid */}
        <section>
          <h3 className="text-[10px] text-[#606070] uppercase tracking-[0.15em] mb-3">Location</h3>
          <div className="grid grid-cols-2 gap-2">
            {[
              { label: 'Zone', value: robot.zone || 'Unknown' },
              { label: 'Position', value: `(${robot.position.x.toFixed(1)}, ${robot.position.y.toFixed(1)})` },
              { label: 'Heading', value: `${robot.heading.toFixed(0)}°` },
              { label: 'Speed', value: `${formatSpeed(robot.speed)} mph` },
            ].map(s => (
              <div key={s.label} className="bg-[#1a1a25] rounded-lg p-3.5 border border-white/[0.04]">
                <div className="text-[10px] text-[#606070] uppercase tracking-wider mb-1">{s.label}</div>
                <div className="text-sm text-white font-medium tabular-nums">{s.value}</div>
              </div>
            ))}
          </div>
        </section>

        {/* Current Task */}
        <section>
          <h3 className="text-[10px] text-[#606070] uppercase tracking-[0.15em] mb-3">Current Task</h3>
          {robot.current_task ? (
            <div className="bg-[#1a1a25] rounded-xl p-5 border border-white/[0.04] space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-white font-mono text-xs">{robot.current_task.task_id}</span>
                <span className="text-[#606070] text-xs capitalize">{robot.current_task.task_type}</span>
              </div>
              <div className="text-sm text-[#a0a0b0]">
                <span className="text-white">{robot.current_task.from_station}</span>
                <span className="text-[#00d4ff] mx-2">→</span>
                <span className="text-white">{robot.current_task.to_station}</span>
              </div>
              <div className="text-[11px] text-[#606070]">Started {timeAgo(robot.current_task.started_at)}</div>
              {robot.current_task.eta_seconds != null && (
                <>
                  <div className="flex justify-between text-xs">
                    <span className="text-[#606070]">ETA</span>
                    <span className="text-[#00d4ff] tabular-nums font-medium"
                          style={{ textShadow: '0 0 10px rgba(0,212,255,0.3)' }}>
                      {robot.current_task.eta_seconds < 60
                        ? `${robot.current_task.eta_seconds.toFixed(0)}s`
                        : `${(robot.current_task.eta_seconds / 60).toFixed(1)} min`}
                    </span>
                  </div>
                  <div className="h-2 bg-[#0a0a0f] rounded-full overflow-hidden border border-white/[0.04]">
                    <div className="h-full rounded-full bg-[#00d4ff]/40 transition-all glow-cyan-sm"
                         style={{ width: `${Math.max(5, 100 - (robot.current_task.eta_seconds / 300) * 100)}%` }} />
                  </div>
                </>
              )}
            </div>
          ) : (
            <div className="bg-[#1a1a25] rounded-xl p-5 border border-white/[0.04] text-sm text-[#606070]">
              No active task
            </div>
          )}
        </section>

        {/* Recent Activity */}
        <section>
          <h3 className="text-[10px] text-[#606070] uppercase tracking-[0.15em] mb-3">Recent Activity</h3>
          <div className="space-y-2">
            {robot.recent_activity.length === 0 ? (
              <div className="text-sm text-[#606070]">No recent activity</div>
            ) : (
              robot.recent_activity.slice(0, 6).map((activity, i) => (
                <div key={i} className="flex items-start gap-3 text-xs">
                  <span className="text-[#606070] flex-shrink-0 w-12 text-right tabular-nums mt-0.5">
                    {timeAgo(activity.timestamp)}
                  </span>
                  <div className="w-px h-4 bg-white/[0.06] flex-shrink-0 mt-0.5" />
                  <span className="text-[#a0a0b0]">{activity.description}</span>
                </div>
              ))
            )}
          </div>
        </section>

        {/* Last Error — with remediation steps */}
        <section>
          <h3 className="text-[10px] text-[#606070] uppercase tracking-[0.15em] mb-3">Last Error</h3>
          {robot.last_error ? (
            <div className={`rounded-xl p-5 text-sm space-y-3 border ${
              robot.last_error.resolved
                ? 'bg-[#1a1a25] border-white/[0.04]'
                : 'bg-[#ff3b3b]/[0.05] border-[#ff3b3b]/20'
            }`}
            style={!robot.last_error.resolved ? { boxShadow: '0 0 20px rgba(255,59,59,0.1)' } : {}}>
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs text-white">{robot.last_error.error_code}</span>
                {robot.last_error.resolved ? (
                  <span className="text-[10px] font-semibold text-[#00ff88] text-glow-green">RESOLVED</span>
                ) : (
                  <span className="text-[10px] font-semibold text-[#ff3b3b] text-glow-red animate-breathing">ACTIVE</span>
                )}
              </div>
              <div className="text-[#a0a0b0] text-xs">{robot.last_error.name}</div>
              <div className="text-[11px] text-[#606070]">{timeAgo(robot.last_error.timestamp)}</div>

              {/* Remediation Steps (only for active errors) */}
              {!robot.last_error.resolved && remediation && (
                <div className="mt-3 space-y-3 border-t border-[#ff3b3b]/10 pt-3">
                  {/* Description */}
                  <p className="text-[11px] text-[#a0a0b0] leading-relaxed">{remediation.description}</p>

                  {/* Common Causes */}
                  <div>
                    <div className="text-[9px] text-[#ff3b3b]/70 uppercase tracking-wider font-semibold mb-1.5">Likely Causes</div>
                    <ul className="space-y-1">
                      {remediation.common_causes.map((cause, i) => (
                        <li key={i} className="text-[11px] text-[#a0a0b0] flex items-start gap-1.5">
                          <span className="text-[#ff3b3b] mt-0.5 text-[8px]">▸</span>
                          {cause}
                        </li>
                      ))}
                    </ul>
                  </div>

                  {/* Steps checklist */}
                  <div>
                    <div className="text-[9px] text-[#00ff88]/70 uppercase tracking-wider font-semibold mb-2">
                      Fix Steps ({checkedSteps.size}/{remediation.remediation_steps.length})
                    </div>
                    <div className="space-y-2">
                      {remediation.remediation_steps.map((step, i) => (
                        <button
                          key={i}
                          onClick={() => toggleStep(i)}
                          className={`w-full text-left flex items-start gap-2.5 px-3 py-2 rounded-lg border transition-all duration-200 ${
                            checkedSteps.has(i)
                              ? 'bg-[#00ff88]/[0.06] border-[#00ff88]/20'
                              : 'bg-[#1a1a25] border-white/[0.04] hover:border-white/[0.08]'
                          }`}
                        >
                          <span className={`w-4 h-4 rounded-sm border flex-shrink-0 mt-0.5 flex items-center justify-center text-[10px] transition-all ${
                            checkedSteps.has(i)
                              ? 'bg-[#00ff88] border-[#00ff88] text-[#0a0a0f]'
                              : 'border-[#606070]'
                          }`}>
                            {checkedSteps.has(i) && '✓'}
                          </span>
                          <span className={`text-[11px] leading-relaxed ${
                            checkedSteps.has(i) ? 'text-[#a0a0b0] line-through' : 'text-white'
                          }`}>
                            {step}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Confirm fix applied */}
                  <button
                    onClick={() => sendCommand('clear_error')}
                    disabled={!allStepsChecked}
                    className={`w-full py-2.5 rounded-lg text-xs font-semibold uppercase tracking-wider transition-all duration-300 ${
                      allStepsChecked
                        ? 'bg-[#00ff88]/20 text-[#00ff88] border border-[#00ff88]/30 hover:bg-[#00ff88]/30 cursor-pointer'
                        : 'bg-[#1a1a25] text-[#606070] border border-white/[0.04] cursor-not-allowed'
                    }`}
                    style={allStepsChecked ? { boxShadow: '0 0 15px rgba(0,255,136,0.2)' } : {}}
                  >
                    {allStepsChecked
                      ? '✓ Confirm Fix Applied — Clear Error'
                      : `Complete all ${remediation.remediation_steps.length} steps to clear`
                    }
                  </button>

                  {remediation.auto_recoverable && (
                    <p className="text-[10px] text-[#00d4ff]/60 text-center">
                      ℹ This error may auto-resolve once the condition clears
                    </p>
                  )}
                </div>
              )}

              {/* Loading state */}
              {!robot.last_error.resolved && remLoading && (
                <div className="mt-3 text-[11px] text-[#606070] flex items-center gap-2">
                  <div className="w-3 h-3 border border-[#ff3b3b]/30 border-t-[#ff3b3b] rounded-full animate-spin" />
                  Loading remediation steps...
                </div>
              )}
            </div>
          ) : (
            <div className="bg-[#1a1a25] rounded-xl p-5 text-sm border border-white/[0.04]">
              <span className="text-[#00ff88] text-glow-green">✓</span>
              <span className="text-[#a0a0b0] ml-2">No errors in recent history</span>
            </div>
          )}
        </section>

        {/* Actions */}
        <section>
          <h3 className="text-[10px] text-[#606070] uppercase tracking-[0.15em] mb-3">Actions</h3>
          <div className="flex gap-2 flex-wrap">
            {robot.status === 'active' && (
              <ActionBtn label="Pause" onClick={() => sendCommand('pause')} />
            )}
            {robot.status === 'idle' && (
              <>
                <ActionBtn label="Resume" onClick={() => sendCommand('resume')} color="#00ff88" />
                <ActionBtn label="Assign Task" onClick={() => dispatch({ type: 'SET_ASSIGN_TASK_ROBOT', robotId: robot.id })} color="#00d4ff" />
              </>
            )}
            {/* Only show clear error when there's remediation but no active error state needing checklist */}
            {robot.status === 'error' && !remediation && (
              <ActionBtn label="Clear Error" onClick={() => sendCommand('clear_error')} color="#ff3b3b" />
            )}
            <ActionBtn
              label="⚡ Send to Charge"
              onClick={() => sendCommand('send_to_charging')}
              color={robot.status === 'charging' ? '#3b82f6' : '#00d4ff'}
            />
            <ActionBtn
              label="📍 View Path"
              onClick={() => dispatch({ type: 'SET_VIEW_PATH_ROBOT', robotId: robot.id })}
            />
          </div>
        </section>
      </div>
    </div>
  );
}

function ActionBtn({ label, onClick, color }: { label: string; onClick: () => void; color?: string }) {
  return (
    <button
      onClick={onClick}
      className="text-xs font-medium border px-3 py-1.5 rounded-lg transition-all duration-200 hover:scale-[1.02]"
      style={{
        color: color || '#a0a0b0',
        borderColor: color ? `${color}30` : 'rgba(255,255,255,0.08)',
        ...(color ? { boxShadow: `0 0 8px ${color}15` } : {}),
      }}
      onMouseEnter={(e) => {
        (e.target as HTMLElement).style.backgroundColor = color ? `${color}10` : 'rgba(255,255,255,0.03)';
        (e.target as HTMLElement).style.borderColor = color ? `${color}50` : 'rgba(255,255,255,0.15)';
      }}
      onMouseLeave={(e) => {
        (e.target as HTMLElement).style.backgroundColor = 'transparent';
        (e.target as HTMLElement).style.borderColor = color ? `${color}30` : 'rgba(255,255,255,0.08)';
      }}
    >
      {label}
    </button>
  );
}

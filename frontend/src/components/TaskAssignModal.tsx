import { useState, useEffect, useMemo } from 'react';
import { useFleet } from '../context/FleetContext';
import { VENDOR_INFO } from '../lib/colors';
import api from '../lib/api';
import type { CatalogTask } from '../types/robot';

export default function TaskAssignModal() {
  const { state, dispatch } = useFleet();
  const robotId = state.assignTaskRobotId;
  const robot = state.robots.find(r => r.id === robotId);

  const [selectedTask, setSelectedTask] = useState<CatalogTask | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message?: string; taskName?: string } | null>(null);
  const [filterCategory, setFilterCategory] = useState<string>('All');

  // NL instruction state
  const [nlInstruction, setNlInstruction] = useState('');
  const [nlParsing, setNlParsing] = useState(false);
  const [nlResult, setNlResult] = useState<{
    catalog_task_id: string | null;
    task_type: string;
    from_station: string | null;
    to_station: string | null;
    confidence: number;
    interpretation: string;
  } | null>(null);
  const [showNlMode, setShowNlMode] = useState(false);

  // Filter catalog by robot vendor
  const availableTasks = useMemo(() => {
    if (!robot) return [];
    return state.taskCatalog.filter(t => t.vendors.includes(robot.vendor));
  }, [state.taskCatalog, robot]);

  // Group tasks by category
  const categories = useMemo(() => {
    const cats = new Set(availableTasks.map(t => t.category));
    return ['All', ...Array.from(cats)];
  }, [availableTasks]);

  const filteredTasks = useMemo(() => {
    if (filterCategory === 'All') return availableTasks;
    return availableTasks.filter(t => t.category === filterCategory);
  }, [availableTasks, filterCategory]);

  if (!robotId || !robot) return null;

  const vendorInfo = VENDOR_INFO[robot.vendor];
  const vendorColor = vendorInfo?.color || '#00d4ff';

  const close = () => {
    dispatch({ type: 'SET_ASSIGN_TASK_ROBOT', robotId: null });
    setResult(null);
    setSelectedTask(null);
    setShowNlMode(false);
    setNlResult(null);
    setNlInstruction('');
    setFilterCategory('All');
  };

  // ── Quick assign (auto-pick stations) ──
  const handleQuickAssign = async (task: CatalogTask) => {
    setLoading(true);
    setResult(null);
    try {
      const { data } = await api.post(`/robots/${robotId}/command`, {
        command: 'assign_task',
        catalog_task_id: task.id,
        task_type: task.name,
      });
      setResult({ success: data.success, taskName: data.task_name || task.name, message: data.message });
      if (data.success) setTimeout(close, 1800);
    } catch {
      setResult({ success: false, message: 'Failed to assign task' });
    } finally {
      setLoading(false);
    }
  };

  // ── NL: Parse the instruction ──
  const handleNlParse = async () => {
    if (!nlInstruction.trim()) return;
    setNlParsing(true);
    setNlResult(null);
    try {
      const { data } = await api.post(`/robots/${robotId}/nl-task`, {
        instruction: nlInstruction,
        execute: false,
      });
      if (data.success) {
        setNlResult({
          catalog_task_id: data.catalog_task_id,
          task_type: data.task_type,
          from_station: data.from_station,
          to_station: data.to_station,
          confidence: data.confidence,
          interpretation: data.interpretation,
        });
      } else {
        setResult({ success: false, message: data.error || 'Could not parse instruction' });
      }
    } catch {
      setResult({ success: false, message: 'Failed to parse instruction' });
    } finally {
      setNlParsing(false);
    }
  };

  // ── NL: Execute the parsed task ──
  const handleNlExecute = async () => {
    if (!nlInstruction.trim()) return;
    setLoading(true);
    setResult(null);
    try {
      const { data } = await api.post(`/robots/${robotId}/nl-task`, {
        instruction: nlInstruction,
        execute: true,
      });
      if (data.executed && data.command_result?.success) {
        setResult({
          success: true,
          taskName: data.task_type,
          message: data.interpretation,
        });
        setTimeout(close, 1800);
      } else {
        setResult({
          success: false,
          message: data.error || data.command_result?.message || 'Task execution failed',
        });
      }
    } catch {
      setResult({ success: false, message: 'Failed to execute task' });
    } finally {
      setLoading(false);
    }
  };

  // Counts per category
  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = { All: availableTasks.length };
    for (const t of availableTasks) {
      counts[t.category] = (counts[t.category] || 0) + 1;
    }
    return counts;
  }, [availableTasks]);

  const confidenceColor = (c: number) =>
    c >= 0.7 ? '#00ff88' : c >= 0.4 ? '#ffb800' : '#ff3b3b';

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center" onClick={close}>
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />

      {/* Modal */}
      <div
        className="relative w-[540px] max-h-[85vh] bg-[#12121a] border border-white/[0.08] rounded-2xl overflow-hidden animate-scale-pop flex flex-col"
        onClick={(e) => e.stopPropagation()}
        style={{ boxShadow: `0 0 80px rgba(0,0,0,0.6), 0 0 40px ${vendorColor}15` }}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-white/[0.06] flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center"
                 style={{ background: `${vendorColor}15`, border: `1px solid ${vendorColor}30` }}>
              <span className="text-lg">🎯</span>
            </div>
            <div>
              <h3 className="text-sm font-semibold text-white">Assign Task to {robot.id}</h3>
              <p className="text-[10px] text-[#606070]">
                {robot.vendor} • {availableTasks.length} tasks available
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* Toggle: Catalog ↔ Natural Language */}
            <button
              onClick={() => { setShowNlMode(!showNlMode); setNlResult(null); setResult(null); }}
              className={`px-3 py-1.5 rounded-lg text-[10px] font-semibold uppercase tracking-wider border transition-all duration-200 ${
                showNlMode
                  ? 'text-[#00d4ff] border-[#00d4ff]/30 bg-[#00d4ff]/8'
                  : 'text-[#a0a0b0] border-white/[0.06] bg-white/[0.03] hover:border-white/[0.12] hover:text-white'
              }`}
              style={showNlMode ? { boxShadow: '0 0 12px rgba(0,212,255,0.15)' } : {}}
            >
              {showNlMode ? '📝 Plain English' : '✨ Use AI'}
            </button>
            <button onClick={close} className="w-7 h-7 rounded-lg bg-white/[0.04] border border-white/[0.06] flex items-center justify-center text-[#606070] hover:text-white hover:border-white/[0.12] transition-all">
              ×
            </button>
          </div>
        </div>

        {showNlMode ? (
          /* ═══════════ NATURAL LANGUAGE MODE ═══════════ */
          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
            <div>
              <label className="text-[10px] text-[#606070] uppercase tracking-wider block mb-2">
                Tell me what {robot.id} should do
              </label>
              <textarea
                value={nlInstruction}
                onChange={(e) => { setNlInstruction(e.target.value); setNlResult(null); }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleNlParse();
                  }
                }}
                placeholder={`e.g. "Move an inventory pod from Zone A to the packing station near Zone C"\n"Pick items from the storage area and bring to Station 5"\n"Go to Zone D and do a safety patrol"`}
                className="w-full bg-[#0a0a0f] border border-white/[0.08] rounded-xl px-4 py-3 text-sm text-white placeholder:text-[#606070] focus:outline-none focus:border-[#00d4ff]/40 transition-colors resize-none"
                style={{ minHeight: '100px' }}
              />
              <div className="flex justify-between items-center mt-2">
                <p className="text-[10px] text-[#606070]">Press Enter to analyze • Shift+Enter for newline</p>
                <button
                  onClick={handleNlParse}
                  disabled={nlParsing || !nlInstruction.trim()}
                  className="px-4 py-2 rounded-lg text-[11px] font-semibold uppercase tracking-wider transition-all duration-300"
                  style={{
                    background: nlInstruction.trim() ? '#00d4ff18' : '#1a1a25',
                    border: `1px solid ${nlInstruction.trim() ? '#00d4ff35' : 'rgba(255,255,255,0.04)'}`,
                    color: nlInstruction.trim() ? '#00d4ff' : '#606070',
                    boxShadow: nlInstruction.trim() ? '0 0 12px rgba(0,212,255,0.12)' : 'none',
                  }}
                >
                  {nlParsing ? (
                    <span className="flex items-center gap-2">
                      <span className="w-3 h-3 border-2 border-[#00d4ff]/30 border-t-[#00d4ff] rounded-full animate-spin" />
                      Analyzing...
                    </span>
                  ) : '🧠 Analyze'}
                </button>
              </div>
            </div>

            {/* Parsed result preview */}
            {nlResult && (
              <div className="bg-[#1a1a25] rounded-xl border border-white/[0.06] overflow-hidden animate-fade-in">
                {/* Interpretation header */}
                <div className="px-4 py-3 border-b border-white/[0.04] flex items-start gap-3">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5"
                       style={{ background: `${confidenceColor(nlResult.confidence)}15`, border: `1px solid ${confidenceColor(nlResult.confidence)}30` }}>
                    <span className="text-sm">🤖</span>
                  </div>
                  <div className="flex-1">
                    <p className="text-[13px] text-white font-medium leading-relaxed">
                      {nlResult.interpretation}
                    </p>
                    <div className="flex items-center gap-3 mt-2">
                      <span className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded"
                            style={{
                              color: confidenceColor(nlResult.confidence),
                              backgroundColor: `${confidenceColor(nlResult.confidence)}15`,
                            }}>
                        {nlResult.confidence >= 0.7 ? 'High' : nlResult.confidence >= 0.4 ? 'Medium' : 'Low'} confidence
                      </span>
                    </div>
                  </div>
                </div>

                {/* Parsed details */}
                <div className="px-4 py-3 space-y-2">
                  <div className="flex items-center gap-3 text-xs">
                    <span className="text-[#606070] w-16">Task:</span>
                    <span className="text-white font-medium">{nlResult.task_type}</span>
                  </div>
                  {nlResult.from_station && (
                    <div className="flex items-center gap-3 text-xs">
                      <span className="text-[#606070] w-16">From:</span>
                      <span className="text-[#a0a0b0]">{nlResult.from_station}</span>
                    </div>
                  )}
                  {nlResult.to_station && (
                    <div className="flex items-center gap-3 text-xs">
                      <span className="text-[#606070] w-16">To:</span>
                      <span className="text-[#a0a0b0]">{nlResult.to_station}</span>
                    </div>
                  )}
                  {!nlResult.from_station && !nlResult.to_station && (
                    <div className="flex items-center gap-3 text-xs">
                      <span className="text-[#606070] w-16">Route:</span>
                      <span className="text-[#a0a0b0] italic">Auto-assigned by system</span>
                    </div>
                  )}
                </div>

                {/* Execute button */}
                <div className="px-4 py-3 border-t border-white/[0.04]">
                  <button
                    onClick={handleNlExecute}
                    disabled={loading}
                    className="w-full py-2.5 rounded-lg text-[12px] font-bold uppercase tracking-wider transition-all duration-300"
                    style={{
                      background: `${vendorColor}18`,
                      border: `1px solid ${vendorColor}35`,
                      color: vendorColor,
                      boxShadow: `0 0 15px ${vendorColor}15`,
                    }}
                  >
                    {loading ? (
                      <span className="flex items-center justify-center gap-2">
                        <span className="w-3 h-3 border-2 border-current/30 border-t-current rounded-full animate-spin" />
                        Executing...
                      </span>
                    ) : (
                      `⚡ Execute Task on ${robot.id}`
                    )}
                  </button>
                </div>
              </div>
            )}

            {/* Quick examples */}
            {!nlResult && !nlParsing && (
              <div>
                <p className="text-[10px] text-[#606070] uppercase tracking-wider mb-2">Quick examples</p>
                <div className="space-y-1.5">
                  {[
                    `Move an inventory pod from Zone A to Station 5`,
                    `Pick items from storage and bring to the packing area`,
                    `Do a safety patrol through Zone B and Zone C`,
                    `Transport bins from Station 8 to Station 12`,
                    `Go sort packages near the outbound area in Zone F`,
                  ].map((example, i) => (
                    <button
                      key={i}
                      onClick={() => { setNlInstruction(example); setNlResult(null); }}
                      className="w-full text-left px-3 py-2 rounded-lg text-xs text-[#a0a0b0] bg-white/[0.02] border border-white/[0.04] hover:border-white/[0.08] hover:bg-white/[0.04] hover:text-white transition-all"
                    >
                      <span className="text-[#606070] mr-2">→</span>
                      "{example}"
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          /* ═══════════ CATALOG MODE (existing) ═══════════ */
          <>
            {/* Category Tabs */}
            <div className="px-5 py-3 border-b border-white/[0.04] flex-shrink-0">
              <div className="flex gap-1.5 overflow-x-auto scrollbar-hidden">
                {categories.map(cat => (
                  <button
                    key={cat}
                    onClick={() => setFilterCategory(cat)}
                    className={`px-3 py-1.5 rounded-lg text-[10px] font-medium uppercase tracking-wider whitespace-nowrap transition-all duration-200 ${
                      filterCategory === cat
                        ? 'text-white border'
                        : 'bg-white/[0.02] text-[#606070] border border-transparent hover:text-[#a0a0b0] hover:bg-white/[0.04]'
                    }`}
                    style={filterCategory === cat ? {
                      background: `${vendorColor}12`,
                      borderColor: `${vendorColor}40`,
                      color: vendorColor,
                      boxShadow: `0 0 10px ${vendorColor}15`,
                    } : {}}
                  >
                    {cat} <span className="opacity-50 ml-0.5">{categoryCounts[cat] || 0}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Task List — scrollable */}
            <div className="flex-1 overflow-y-auto px-5 py-3 space-y-2 min-h-0"
                 style={{ maxHeight: 'calc(85vh - 200px)' }}>
              {filteredTasks.map(task => (
                <button
                  key={task.id}
                  onClick={() => {
                    if (selectedTask?.id === task.id) {
                      setSelectedTask(null);
                    } else {
                      setSelectedTask(task);
                    }
                  }}
                  disabled={loading}
                  className={`w-full text-left rounded-xl border transition-all duration-200 group ${
                    selectedTask?.id === task.id
                      ? 'border-opacity-40 bg-opacity-8'
                      : 'bg-[#1a1a25]/50 border-white/[0.04] hover:border-white/[0.08] hover:bg-[#1a1a25]'
                  }`}
                  style={selectedTask?.id === task.id ? {
                    background: `${vendorColor}08`,
                    borderColor: `${vendorColor}40`,
                    boxShadow: `0 0 15px ${vendorColor}10`,
                  } : {}}
                >
                  <div className="px-5 py-3.5 flex items-start gap-3">
                    <div className="w-9 h-9 rounded-lg bg-white/[0.04] border border-white/[0.06] flex items-center justify-center text-base flex-shrink-0 mt-0.5
                      group-hover:bg-white/[0.06] transition-colors">
                      {task.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <h4 className="text-[13px] font-semibold text-white group-hover:text-white/90 truncate">
                          {task.name}
                        </h4>
                        {selectedTask?.id !== task.id && (
                          <span className="text-[10px] text-[#606070] opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap ml-2 flex-shrink-0">
                            Click to assign →
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-[#a0a0b0] mt-0.5 leading-relaxed">
                        {task.description}
                      </p>
                      <div className="flex items-center gap-2 mt-1.5">
                        <span className="text-[9px] px-1.5 py-0.5 rounded bg-white/[0.04] text-[#606070] uppercase tracking-wider">
                          {task.category}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Quick assign when selected */}
                  {selectedTask?.id === task.id && (
                    <div className="px-5 pb-4 pt-2 border-t border-white/[0.04] mt-1"
                         onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center gap-2 mt-2">
                        <button
                          onClick={(e) => { e.stopPropagation(); handleQuickAssign(task); }}
                          disabled={loading}
                          className="flex-1 py-2 rounded-lg text-[11px] font-semibold uppercase tracking-wider transition-all duration-300"
                          style={{
                            background: `${vendorColor}18`,
                            border: `1px solid ${vendorColor}35`,
                            color: vendorColor,
                            boxShadow: `0 0 12px ${vendorColor}12`,
                          }}
                        >
                          {loading ? '⏳ Assigning...' : '⚡ Quick Assign'}
                        </button>
                      </div>
                    </div>
                  )}
                </button>
              ))}

              {filteredTasks.length === 0 && (
                <div className="text-center py-10">
                  <p className="text-[#606070] text-sm">No tasks available for this vendor in this category.</p>
                </div>
              )}
            </div>
          </>
        )}

        {/* Result Banner */}
        {result && (
          <div className={`px-5 py-3 border-t flex-shrink-0 ${
            result.success
              ? 'bg-[#00ff88]/5 border-[#00ff88]/20'
              : 'bg-[#ff3b3b]/5 border-[#ff3b3b]/20'
          }`}>
            <p className={`text-xs font-medium ${result.success ? 'text-[#00ff88]' : 'text-[#ff3b3b]'}`}>
              {result.success
                ? `✓ "${result.taskName}" assigned to ${robot.id}`
                : `✗ ${result.message}`
              }
            </p>
          </div>
        )}

        {/* Footer info */}
        <div className="px-5 py-3 border-t border-white/[0.04] flex-shrink-0">
          <p className="text-[10px] text-[#606070] text-center">
            <span className="inline-block w-2 h-2 rounded-full mr-1"
                  style={{ backgroundColor: vendorColor, boxShadow: `0 0 6px ${vendorColor}60` }} />
            {robot.vendor} — {robot.status === 'idle' ? 'Ready for task' : robot.status === 'active' ? 'Currently busy (will queue)' : robot.status}
            {showNlMode && ' • AI-powered task parsing'}
          </p>
        </div>
      </div>
    </div>
  );
}

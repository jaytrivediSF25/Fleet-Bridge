import { useState, useRef, useEffect, useMemo } from 'react';
import { useFleet } from '../context/FleetContext';
import { STATUS_COLORS, STATUS_GLOW_CSS } from '../lib/colors';
import api from '../lib/api';
import type { ChatResponse } from '../types/robot';
import MarkdownRenderer from './MarkdownRenderer';

const RESPONSE_TYPE_ICONS: Record<string, { icon: string; color: string; label: string }> = {
  status:         { icon: '📡', color: '#00d4ff', label: 'Fleet Status' },
  analysis:       { icon: '📊', color: '#00ff88', label: 'Analysis' },
  recommendation: { icon: '💡', color: '#ffb800', label: 'Recommendation' },
  error_lookup:   { icon: '🔍', color: '#ff3b3b', label: 'Error Lookup' },
  action:         { icon: '⚡', color: '#8b5cf6', label: 'Action' },
};

export default function TopBar() {
  const { state, dispatch } = useFleet();
  const [query, setQuery] = useState('');
  const [focused, setFocused] = useState(false);
  const [loading, setLoading] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const counts = useMemo(() => {
    const c = { active: 0, idle: 0, error: 0, charging: 0, offline: 0 };
    state.robots.forEach(r => { c[r.status]++; });
    return c;
  }, [state.robots]);

  const suggestions = [
    { text: 'What\'s the fleet status?', icon: '🤖' },
    { text: 'Which robots have errors?', icon: '🔴' },
    { text: 'Compare Amazon vs Balyo performance', icon: '📊' },
    { text: 'Which robots are below 30% battery?', icon: '🔋' },
    { text: 'Are there any active alerts?', icon: '🚨' },
    { text: 'Show me top performing robots', icon: '🏆' },
  ];

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setFocused(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Keyboard shortcut: Cmd+K or Ctrl+K to focus
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
        setFocused(true);
      }
      if (e.key === 'Escape') {
        setFocused(false);
        inputRef.current?.blur();
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  const handleSubmit = async (q?: string) => {
    const queryText = (q || query).trim();
    if (!queryText || loading) return;
    setQuery(queryText);
    setLoading(true);
    try {
      const { data } = await api.post<ChatResponse>('/chat', {
        query: queryText,
        conversation_id: conversationId,
      });
      setConversationId(data.conversation_id);
      dispatch({
        type: 'SET_NL_QUERY_RESPONSE',
        response: {
          query: queryText,
          response: data.response,
          robotIds: data.robot_ids || [],
          followups: data.suggested_followups || [],
          responseType: data.response_type || 'status',
        },
      });
    } catch {
      dispatch({
        type: 'SET_NL_QUERY_RESPONSE',
        response: {
          query: queryText,
          response: 'Sorry, I couldn\'t process that query. Please try again.',
          robotIds: [],
          followups: ['What\'s the fleet status?', 'Which robots have errors?'],
          responseType: 'status',
        },
      });
    } finally {
      setLoading(false);
    }
  };

  const handleFollowUp = (followUpQuery: string) => {
    setQuery(followUpQuery);
    handleSubmit(followUpQuery);
  };

  const dismissResponse = () => {
    dispatch({ type: 'SET_NL_QUERY_RESPONSE', response: null });
    setFocused(false);
  };

  const nlResponse = state.nlQueryResponse;
  const responseInfo = nlResponse ? RESPONSE_TYPE_ICONS[nlResponse.responseType] || RESPONSE_TYPE_ICONS.status : null;

  return (
    <header className="h-16 flex-shrink-0 backdrop-blur-xl bg-black/50 border-b border-white/[0.08] flex items-center px-6 gap-5 relative z-50">
      {/* Logo — Geometric diamond with glow */}
      <button
        onClick={() => {
          dispatch({ type: 'SELECT_ROBOT', robotId: null });
          dispatch({ type: 'SET_NL_QUERY_RESPONSE', response: null });
        }}
        className="flex items-center gap-3 flex-shrink-0 group ml-2"
      >
        <div className="relative flex-shrink-0" style={{ width: 36, height: 36 }}>
          <div className="absolute top-1/2 left-1/2 w-6 h-6 -translate-x-1/2 -translate-y-1/2 rotate-45 rounded-sm bg-gradient-to-br from-[#00d4ff] to-[#00ff88] opacity-90 group-hover:opacity-100 transition-opacity"
               style={{ boxShadow: '0 0 20px rgba(0,212,255,0.4)' }} />
          <div className="absolute top-1/2 left-1/2 w-6 h-6 -translate-x-1/2 -translate-y-1/2 rotate-45 rounded-sm bg-gradient-to-br from-[#00d4ff] to-[#00ff88] blur-lg opacity-30 group-hover:opacity-50 transition-opacity" />
        </div>
        <div className="flex flex-col">
          <span className="text-white text-sm font-bold tracking-[0.2em] leading-none">FLEETBRIDGE</span>
          <span className="text-[#606070] text-[9px] tracking-[0.15em] leading-none mt-0.5">COMMAND CENTER</span>
        </div>
      </button>

      {/* NL Search / Query Bar — The command input */}
      <div ref={dropdownRef} className="flex-1 max-w-2xl mx-auto relative">
        <div className={`flex items-center bg-[#12121a]/80 rounded-xl border transition-all duration-300 ${
          focused
            ? 'border-[#00d4ff]/40 shadow-[0_0_25px_rgba(0,212,255,0.15)]'
            : 'border-white/[0.08] hover:border-white/[0.12]'
        }`}>
          <span className="pl-4 text-[#606070]">
            {loading ? (
              <span className="flex gap-1">
                <span className="w-1.5 h-1.5 bg-[#00d4ff] rounded-full" style={{ animation: 'dot-pulse 1.4s infinite', animationDelay: '0ms' }} />
                <span className="w-1.5 h-1.5 bg-[#00d4ff] rounded-full" style={{ animation: 'dot-pulse 1.4s infinite', animationDelay: '200ms' }} />
                <span className="w-1.5 h-1.5 bg-[#00d4ff] rounded-full" style={{ animation: 'dot-pulse 1.4s infinite', animationDelay: '400ms' }} />
              </span>
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>
              </svg>
            )}
          </span>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onFocus={() => setFocused(true)}
            onKeyDown={e => e.key === 'Enter' && handleSubmit()}
            placeholder='Ask anything... "Where is Robot 7?" "Compare vendors" "Show errors"'
            className="flex-1 bg-transparent text-sm text-white placeholder:text-[#606070] px-3 py-3 focus:outline-none"
          />
          {/* Keyboard shortcut badge */}
          {!focused && !query && (
            <span className="pr-4 text-[10px] text-[#606070] border border-white/[0.06] rounded px-1.5 py-0.5 flex-shrink-0">
              ⌘K
            </span>
          )}
          {query && (
            <button
              onClick={() => { setQuery(''); dismissResponse(); }}
              className="pr-4 text-[#606070] hover:text-white transition-colors"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6 6 18M6 6l12 12"/></svg>
            </button>
          )}
        </div>

        {/* Suggestions dropdown */}
        {focused && !nlResponse && !loading && (
          <div className="absolute top-full left-0 right-0 mt-2 bg-[#12121a] border border-white/[0.08] rounded-xl shadow-[0_20px_60px_rgba(0,0,0,0.5)] overflow-hidden z-50"
               style={{ animation: 'slideUp 200ms ease-out' }}>
            <div className="px-4 py-2.5 text-[10px] text-[#606070] uppercase tracking-[0.15em] flex items-center gap-2">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg>
              Suggested Queries
            </div>
            {suggestions.map(s => (
              <button
                key={s.text}
                onClick={() => handleSubmit(s.text)}
                className="w-full text-left px-4 py-2.5 text-sm text-[#a0a0b0] hover:text-white hover:bg-[#1a1a25] transition-all duration-150 flex items-center gap-3"
              >
                <span className="text-base flex-shrink-0">{s.icon}</span>
                <span>{s.text}</span>
              </button>
            ))}
          </div>
        )}

        {/* Loading state */}
        {loading && (
          <div className="absolute top-full left-0 right-0 mt-2 bg-[#12121a] border border-[#00d4ff]/20 rounded-xl shadow-[0_20px_60px_rgba(0,0,0,0.5),0_0_30px_rgba(0,212,255,0.1)] overflow-hidden z-50"
               style={{ animation: 'slideUp 200ms ease-out' }}>
            <div className="p-5 flex items-center gap-4">
              <div className="relative w-8 h-8 flex-shrink-0">
                <div className="absolute inset-0 rounded-lg bg-[#00d4ff]/10 animate-pulse" />
                <div className="relative w-8 h-8 rounded-lg bg-[#00d4ff]/5 border border-[#00d4ff]/20 flex items-center justify-center">
                  <span className="text-[#00d4ff] text-sm">◆</span>
                </div>
              </div>
              <div className="flex-1">
                <div className="text-[10px] text-[#00d4ff] font-semibold uppercase tracking-[0.15em] mb-1">Analyzing Fleet Data</div>
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-1 bg-[#1a1a25] rounded-full overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-[#00d4ff] to-[#00ff88] rounded-full shimmer" style={{ width: '60%' }} />
                  </div>
                  <span className="text-[10px] text-[#606070]">Processing...</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ══════════════ NL Response Panel ══════════════ */}
        {nlResponse && !loading && (
          <div className="absolute top-full left-0 right-0 mt-2 bg-[#12121a] border rounded-xl shadow-[0_20px_60px_rgba(0,0,0,0.5)] overflow-hidden z-50 max-h-[70vh] flex flex-col"
               style={{
                 borderColor: `${responseInfo?.color || '#00d4ff'}30`,
                 boxShadow: `0 20px 60px rgba(0,0,0,0.5), 0 0 30px ${responseInfo?.color || '#00d4ff'}15`,
                 animation: 'slideUp 250ms ease-out',
               }}>

            {/* Response header with type badge */}
            <div className="px-5 py-3 border-b border-white/[0.06] flex items-center justify-between flex-shrink-0">
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-md flex items-center justify-center text-xs"
                       style={{ backgroundColor: `${responseInfo?.color}15`, border: `1px solid ${responseInfo?.color}30` }}>
                    {responseInfo?.icon}
                  </div>
                  <span className="text-[10px] font-semibold uppercase tracking-[0.15em]"
                        style={{ color: responseInfo?.color }}>
                    {responseInfo?.label}
                  </span>
                </div>
                <span className="text-[10px] text-[#606070]">·</span>
                <span className="text-[10px] text-[#606070]">{nlResponse.query}</span>
              </div>
              <button
                onClick={dismissResponse}
                className="text-[#606070] hover:text-white transition-colors p-1"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6 6 18M6 6l12 12"/></svg>
              </button>
            </div>

            {/* Response body — scrollable */}
            <div className="flex-1 overflow-y-auto px-5 py-4 min-h-0">
              <MarkdownRenderer content={nlResponse.response} />
            </div>

            {/* Action bar */}
            <div className="flex-shrink-0 border-t border-white/[0.06]">
              {/* Robot action buttons */}
              {nlResponse.robotIds.length > 0 && (
                <div className="px-5 py-2.5 border-b border-white/[0.04] flex items-center gap-2">
                  <span className="text-[10px] text-[#606070] uppercase tracking-wider mr-1">Robots:</span>
                  {nlResponse.robotIds.slice(0, 5).map(rid => (
                    <button
                      key={rid}
                      onClick={() => {
                        dispatch({ type: 'SELECT_ROBOT', robotId: rid });
                        dismissResponse();
                      }}
                      className="text-xs font-mono px-2 py-1 rounded-md border transition-all duration-200 hover:scale-105"
                      style={{
                        borderColor: `${responseInfo?.color}30`,
                        color: responseInfo?.color,
                        backgroundColor: `${responseInfo?.color}08`,
                      }}
                    >
                      {rid}
                    </button>
                  ))}
                  {nlResponse.robotIds.length > 5 && (
                    <span className="text-[10px] text-[#606070]">
                      +{nlResponse.robotIds.length - 5} more
                    </span>
                  )}
                </div>
              )}

              {/* Follow-up suggestions */}
              {nlResponse.followups.length > 0 && (
                <div className="px-5 py-3 flex items-start gap-2 flex-wrap">
                  <span className="text-[10px] text-[#606070] uppercase tracking-wider mt-1.5 flex-shrink-0">Ask next:</span>
                  {nlResponse.followups.map((q, i) => (
                    <button
                      key={i}
                      onClick={() => handleFollowUp(q)}
                      className="text-xs text-[#a0a0b0] hover:text-white bg-[#1a1a25] hover:bg-[#252530] px-3 py-1.5 rounded-lg border border-white/[0.06] hover:border-[#00d4ff]/20 transition-all duration-200 hover:shadow-[0_0_10px_rgba(0,212,255,0.08)]"
                    >
                      <span className="text-[#00d4ff]/50 mr-1.5">→</span>{q}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Fleet Status Pills — with GLOW */}
      <div className="relative flex-shrink-0">
        <button
          onClick={() => dispatch({ type: 'TOGGLE_STATUS_EXPANDED' })}
          className="flex items-center gap-3 hover:opacity-90 transition-opacity"
        >
          {/* Active count */}
          <div className="flex items-center gap-1.5 bg-[#00ff88]/10 px-2.5 py-1 rounded-lg" style={{ boxShadow: '0 0 12px rgba(0,255,136,0.15)' }}>
            <span className="w-2 h-2 rounded-full bg-[#00ff88] shadow-[0_0_8px_#00ff88]" />
            <span className="text-[#00ff88] text-xs font-semibold tabular-nums">{counts.active}</span>
          </div>

          {counts.error > 0 && (
            <div className="flex items-center gap-1.5 bg-[#ff3b3b]/10 px-2.5 py-1 rounded-lg animate-pulse-red" style={{ boxShadow: '0 0 12px rgba(255,59,59,0.2)' }}>
              <span className="w-2 h-2 rounded-full bg-[#ff3b3b] shadow-[0_0_8px_#ff3b3b]" />
              <span className="text-[#ff3b3b] text-xs font-semibold tabular-nums">{counts.error}</span>
            </div>
          )}

          {counts.idle > 0 && (
            <div className="flex items-center gap-1.5 bg-[#ffb800]/10 px-2.5 py-1 rounded-lg">
              <span className="w-2 h-2 rounded-full bg-[#ffb800] shadow-[0_0_6px_#ffb800]" />
              <span className="text-[#ffb800] text-xs font-semibold tabular-nums">{counts.idle}</span>
            </div>
          )}
        </button>

        {/* Expanded status breakdown */}
        {state.showStatusExpanded && (
          <div className="absolute top-full right-0 mt-3 bg-[#12121a] border border-white/[0.08] rounded-xl shadow-[0_20px_60px_rgba(0,0,0,0.6)] w-60 z-50"
               style={{ animation: 'slideUp 200ms ease-out' }}>
            <div className="px-4 py-3 border-b border-white/[0.06]">
              <span className="text-[10px] text-[#606070] uppercase tracking-[0.15em]">Fleet Status</span>
            </div>
            <div className="p-3 space-y-2.5">
              {(Object.entries(counts) as [string, number][]).map(([status, count]) => (
                <div key={status} className="flex items-center justify-between">
                  <span className="flex items-center gap-2.5">
                    <span className={`w-2.5 h-2.5 rounded-full ${STATUS_GLOW_CSS[status as keyof typeof STATUS_GLOW_CSS]}`}
                          style={{ backgroundColor: STATUS_COLORS[status as keyof typeof STATUS_COLORS] }} />
                    <span className="text-[#a0a0b0] text-sm capitalize">{status}</span>
                  </span>
                  <span className="text-white font-semibold tabular-nums text-sm"
                        style={{ textShadow: count > 0 ? `0 0 10px ${STATUS_COLORS[status as keyof typeof STATUS_COLORS]}40` : 'none' }}>
                    {count}
                  </span>
                </div>
              ))}
            </div>
            <div className="px-4 py-2.5 border-t border-white/[0.06] text-xs text-[#606070]">
              Total: <span className="text-white tabular-nums">{state.robots.length}</span> robots online
            </div>
          </div>
        )}
      </div>

      {/* User avatar */}
      <div className="w-9 h-9 rounded-full bg-gradient-to-br from-[#252530] to-[#1a1a25] border border-white/[0.08] flex items-center justify-center flex-shrink-0 hover:border-white/[0.15] transition-colors cursor-pointer">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#606070" strokeWidth="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
      </div>

      {/* Connection lost banner */}
      {state.connectionLost && (
        <div className="absolute top-full left-0 right-0 bg-gradient-to-r from-[#ffb800] to-[#ff8800] text-black px-6 py-2.5 text-sm flex items-center justify-between z-40 shadow-[0_0_30px_rgba(255,184,0,0.3)]">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-black/30 animate-pulse" />
            <span className="font-medium">Connection lost — robot positions may be outdated</span>
          </div>
          <button className="text-xs font-bold border border-black/20 px-3 py-1 rounded-lg hover:bg-black/10 transition-colors">
            Reconnect
          </button>
        </div>
      )}
    </header>
  );
}

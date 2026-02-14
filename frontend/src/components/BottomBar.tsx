import { useState } from 'react';
import { useFleet } from '../context/FleetContext';
import { useChat } from '../hooks/useChat';
import api from '../lib/api';
import type { ChatResponse } from '../types/robot';

export default function BottomBar() {
  const { state, dispatch } = useFleet();
  const { sendMessage, loading: chatLoading } = useChat();
  const [input, setInput] = useState('');
  const [chatFocused, setChatFocused] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSend = async () => {
    const q = input.trim();
    if (!q || loading || chatLoading) return;
    setInput('');

    // Also send to the TopBar NL engine for inline results
    setLoading(true);
    try {
      const { data } = await api.post<ChatResponse>('/chat', { query: q });
      dispatch({
        type: 'SET_NL_QUERY_RESPONSE',
        response: {
          query: q,
          response: data.response,
          robotIds: data.robot_ids || [],
          followups: data.suggested_followups || [],
          responseType: data.response_type || 'status',
        },
      });
    } catch {
      // Fallback to chat panel
      sendMessage(q);
      dispatch({ type: 'SET_RIGHT_PANEL_VIEW', view: 'chat-response' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <footer className="h-14 flex-shrink-0 bg-[#12121a] border-t border-white/[0.06] flex items-center px-6 gap-4 z-40">
      {/* Chat Input */}
      <div className={`flex-1 flex items-center bg-[#0a0a0f]/60 rounded-xl border transition-all duration-300 ${
        chatFocused
          ? 'border-[#00d4ff]/30 shadow-[0_0_15px_rgba(0,212,255,0.1)]'
          : 'border-white/[0.06] hover:border-white/[0.10]'
      }`}>
        <span className="pl-3.5 text-[#606070]">
            {(loading || chatLoading) ? (
            <span className="flex gap-1">
              <span className="w-1 h-1 bg-[#00d4ff] rounded-full" style={{ animation: 'dot-pulse 1.4s infinite', animationDelay: '0ms' }} />
              <span className="w-1 h-1 bg-[#00d4ff] rounded-full" style={{ animation: 'dot-pulse 1.4s infinite', animationDelay: '200ms' }} />
              <span className="w-1 h-1 bg-[#00d4ff] rounded-full" style={{ animation: 'dot-pulse 1.4s infinite', animationDelay: '400ms' }} />
            </span>
          ) : (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
          )}
        </span>
        <input
          type="text"
          value={input}
          onChange={e => setInput(e.target.value)}
          onFocus={() => setChatFocused(true)}
          onBlur={() => setChatFocused(false)}
          onKeyDown={e => e.key === 'Enter' && handleSend()}
          placeholder="Ask FleetBridge anything..."
          disabled={loading || chatLoading}
          className="flex-1 bg-transparent text-sm text-white placeholder:text-[#606070] px-3 py-2.5 focus:outline-none disabled:opacity-40"
        />
        {input && (
          <button
            onClick={handleSend}
            disabled={loading || chatLoading}
            className="pr-3.5 text-[#00d4ff] hover:text-white transition-colors disabled:opacity-30"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>
          </button>
        )}
      </div>

      {/* Quick Nav */}
      <div className="flex items-center gap-1.5 flex-shrink-0">
        <button
          onClick={() => dispatch({ type: 'SET_RIGHT_PANEL_VIEW', view: 'chat' })}
          className={`px-3.5 py-1.5 text-xs font-medium rounded-lg border transition-all duration-200 ${
            state.rightPanelView === 'chat'
              ? 'bg-[#00d4ff]/10 border-[#00d4ff]/30 text-[#00d4ff] shadow-[0_0_12px_rgba(0,212,255,0.15)]'
              : 'border-white/[0.06] text-[#a0a0b0] hover:text-white hover:border-white/[0.12] hover:bg-white/[0.03]'
          }`}
        >
          Chat
        </button>
        <button
          onClick={() => dispatch({ type: 'TOGGLE_ANALYTICS_OVERLAY' })}
          className={`px-3.5 py-1.5 text-xs font-medium rounded-lg border transition-all duration-200 ${
            state.showAnalyticsOverlay
              ? 'bg-[#00d4ff]/10 border-[#00d4ff]/30 text-[#00d4ff] shadow-[0_0_12px_rgba(0,212,255,0.15)]'
              : 'border-white/[0.06] text-[#a0a0b0] hover:text-white hover:border-white/[0.12] hover:bg-white/[0.03]'
          }`}
        >
          Analytics
        </button>
        <button
          onClick={() => dispatch({ type: 'SET_RIGHT_PANEL_VIEW', view: 'errors' })}
          className={`px-3.5 py-1.5 text-xs font-medium rounded-lg border transition-all duration-200 ${
            state.rightPanelView === 'errors'
              ? 'bg-[#ff3b3b]/10 border-[#ff3b3b]/30 text-[#ff3b3b] shadow-[0_0_12px_rgba(255,59,59,0.15)]'
              : 'border-white/[0.06] text-[#a0a0b0] hover:text-white hover:border-white/[0.12] hover:bg-white/[0.03]'
          }`}
        >
          Errors
        </button>
      </div>

      {/* View Controls */}
      <div className="flex items-center gap-1 flex-shrink-0">
        <button
          onClick={() => dispatch({ type: 'TOGGLE_GRID' })}
          className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm transition-all duration-200 ${
            state.showGrid
              ? 'bg-[#00d4ff]/10 text-[#00d4ff] shadow-[0_0_10px_rgba(0,212,255,0.15)]'
              : 'text-[#606070] hover:text-[#a0a0b0] hover:bg-white/[0.03]'
          }`}
          title="Toggle grid"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
        </button>
        <button
          onClick={() => dispatch({ type: 'TOGGLE_ZONE_LABELS' })}
          className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm transition-all duration-200 ${
            state.showZoneLabels
              ? 'bg-[#00d4ff]/10 text-[#00d4ff] shadow-[0_0_10px_rgba(0,212,255,0.15)]'
              : 'text-[#606070] hover:text-[#a0a0b0] hover:bg-white/[0.03]'
          }`}
          title="Toggle zone labels"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 7V4h16v3M9 20h6M12 4v16"/></svg>
        </button>
        <button
          onClick={() => {
            dispatch({ type: 'SET_MAP_ZOOM', zoom: 1 });
            dispatch({ type: 'SET_MAP_OFFSET', offset: { x: 0, y: 0 } });
          }}
          className="w-8 h-8 rounded-lg flex items-center justify-center text-[#606070] hover:text-[#a0a0b0] hover:bg-white/[0.03] transition-all duration-200"
          title="Reset view"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>
        </button>
      </div>
    </footer>
  );
}

import { useState, useRef, useEffect } from 'react';
import { useChat } from '../hooks/useChat';
import { useFleet } from '../context/FleetContext';
import MarkdownRenderer from './MarkdownRenderer';

export default function ChatPanel() {
  const { messages, loading, sendMessage, clearChat } = useChat();
  const { dispatch } = useFleet();
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = (query?: string) => {
    const q = (query || input).trim();
    if (!q || loading) return;
    setInput('');
    sendMessage(q);
  };

  return (
    <div className="h-full flex flex-col">
      <div className="px-6 py-4 border-b border-white/[0.06] flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-[#00d4ff] shadow-[0_0_8px_#00d4ff]" />
          <span className="text-sm font-semibold text-white tracking-wide">Ask FleetBridge</span>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={clearChat} className="text-xs text-[#606070] hover:text-[#a0a0b0] transition-colors">Clear</button>
          <button onClick={() => dispatch({ type: 'SET_RIGHT_PANEL_VIEW', view: 'alerts' })} className="text-xs text-[#606070] hover:text-[#a0a0b0] transition-colors">← Alerts</button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-5 space-y-3.5">
        {messages.length === 0 && (
          <div className="text-center py-12 space-y-5">
            <div className="relative w-14 h-14 mx-auto">
              <div className="absolute inset-0 rounded-xl bg-gradient-to-br from-[#00d4ff]/20 to-[#00ff88]/20 blur-xl" />
              <div className="relative w-14 h-14 rounded-xl bg-gradient-to-br from-[#00d4ff]/10 to-[#00ff88]/10 border border-white/[0.06] flex items-center justify-center">
                <span className="text-[#00d4ff] text-xl">◆</span>
              </div>
            </div>
            <div className="text-sm text-[#a0a0b0]">Ask anything about your fleet.</div>
            <div className="space-y-2 max-w-xs mx-auto">
              {[
                { text: 'What is the fleet status?', icon: '🤖' },
                { text: 'Which robots have errors?', icon: '🔴' },
                { text: 'Show robots below 20% battery', icon: '🔋' },
                { text: 'Compare vendor performance', icon: '📊' },
                { text: 'Are there any active alerts?', icon: '🚨' },
              ].map(q => (
                <button
                  key={q.text}
                  onClick={() => handleSend(q.text)}
                  className="block w-full text-left text-xs bg-[#1a1a25] text-[#a0a0b0] hover:text-white px-4 py-2.5 rounded-lg border border-white/[0.04] hover:border-[#00d4ff]/20 hover:shadow-[0_0_10px_rgba(0,212,255,0.08)] transition-all duration-200"
                >
                  <span className="mr-2">{q.icon}</span>{q.text}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} className={`${msg.role === 'user' ? 'flex justify-end' : ''}`}
               style={{ animation: 'slideUp 200ms ease-out' }}>
            <div className={`max-w-[95%] rounded-xl px-5 py-4 ${
              msg.role === 'user'
                ? 'bg-[#252530] text-white border border-white/[0.06]'
                : 'bg-[#1a1a25] text-white border border-[#00d4ff]/10'
            }`}
            style={msg.role === 'assistant' ? { boxShadow: '0 0 15px rgba(0,212,255,0.05)' } : {}}>
              {msg.role === 'assistant' && (
                <div className="text-[10px] text-[#00d4ff] mb-2 font-semibold uppercase tracking-[0.15em] flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#00d4ff] shadow-[0_0_4px_#00d4ff]" />
                  FleetBridge AI
                </div>
              )}

              {msg.role === 'user' ? (
                <div className="text-sm text-white">{msg.content}</div>
              ) : (
                <MarkdownRenderer content={msg.content} />
              )}

              {msg.robot_ids.length > 0 && (
                <div className="mt-3 pt-2 border-t border-white/[0.06] flex items-center gap-2 flex-wrap">
                  <span className="text-[10px] text-[#606070] uppercase tracking-wider">Robots:</span>
                  {msg.robot_ids.slice(0, 5).map(rid => (
                    <button
                      key={rid}
                      onClick={() => dispatch({ type: 'SELECT_ROBOT', robotId: rid })}
                      className="text-xs text-[#00d4ff] font-mono px-1.5 py-0.5 rounded bg-[#00d4ff]/5 border border-[#00d4ff]/20 hover:bg-[#00d4ff]/10 transition-colors"
                    >
                      {rid}
                    </button>
                  ))}
                </div>
              )}

              {msg.suggested_followups.length > 0 && (
                <div className="mt-3 pt-2 border-t border-white/[0.06]">
                  <div className="text-[10px] text-[#606070] mb-1.5 uppercase tracking-wider">Follow up</div>
                  <div className="flex flex-wrap gap-1.5">
                    {msg.suggested_followups.map((q, j) => (
                      <button
                        key={j}
                        onClick={() => handleSend(q)}
                        className="text-xs text-[#a0a0b0] hover:text-white bg-[#252530] hover:bg-[#2a2a35] px-2.5 py-1 rounded-md border border-white/[0.04] hover:border-[#00d4ff]/20 transition-all duration-200"
                      >
                        <span className="text-[#00d4ff]/50 mr-1">→</span>{q}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex items-center gap-3 p-3 bg-[#1a1a25] rounded-xl border border-[#00d4ff]/10"
               style={{ boxShadow: '0 0 10px rgba(0,212,255,0.05)', animation: 'slideUp 200ms ease-out' }}>
            <div className="relative w-6 h-6 flex-shrink-0">
              <div className="absolute inset-0 rounded-md bg-[#00d4ff]/10 animate-pulse" />
              <div className="relative w-6 h-6 rounded-md bg-[#00d4ff]/5 border border-[#00d4ff]/20 flex items-center justify-center">
                <span className="text-[#00d4ff] text-[10px]">◆</span>
              </div>
            </div>
            <div className="flex-1">
              <div className="text-[10px] text-[#00d4ff] font-semibold uppercase tracking-[0.15em] mb-1">Analyzing</div>
              <div className="flex gap-1">
                <span className="w-1.5 h-1.5 bg-[#00d4ff] rounded-full" style={{ animation: 'dot-pulse 1.4s infinite', animationDelay: '0ms' }} />
                <span className="w-1.5 h-1.5 bg-[#00d4ff] rounded-full" style={{ animation: 'dot-pulse 1.4s infinite', animationDelay: '200ms' }} />
                <span className="w-1.5 h-1.5 bg-[#00d4ff] rounded-full" style={{ animation: 'dot-pulse 1.4s infinite', animationDelay: '400ms' }} />
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="px-6 py-4 border-t border-white/[0.06]">
        <div className="flex gap-2.5">
          <input
            type="text" value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSend()}
            placeholder="Type your question..."
            disabled={loading}
            className="flex-1 bg-[#1a1a25] text-sm text-white rounded-xl px-4 py-2.5 placeholder:text-[#606070] focus:outline-none focus:border-[#00d4ff]/30 focus:shadow-[0_0_15px_rgba(0,212,255,0.08)] border border-white/[0.06] transition-all duration-300 disabled:opacity-40"
          />
          <button
            onClick={() => handleSend()}
            disabled={loading || !input.trim()}
            className="bg-gradient-to-r from-[#00d4ff]/20 to-[#00ff88]/20 hover:from-[#00d4ff]/30 hover:to-[#00ff88]/30 disabled:from-[#1a1a25] disabled:to-[#1a1a25] text-white px-4 py-2.5 rounded-xl text-sm transition-all duration-200 border border-[#00d4ff]/20 disabled:border-white/[0.04] disabled:text-[#606070]"
          >
            ↗
          </button>
        </div>
      </div>
    </div>
  );
}

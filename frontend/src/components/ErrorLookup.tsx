import { useState, useEffect, useMemo } from 'react';
import { useFleet } from '../context/FleetContext';
import api from '../lib/api';
import type { ErrorCodeEntry } from '../types/robot';

const SEVERITY_STYLE: Record<string, { color: string; bg: string; glow: string }> = {
  critical: { color: '#ff3b3b', bg: '#ff3b3b15', glow: '0 0 10px rgba(255,59,59,0.1)' },
  warning:  { color: '#ffb800', bg: '#ffb80015', glow: '0 0 10px rgba(255,184,0,0.1)' },
  info:     { color: '#00d4ff', bg: '#00d4ff15', glow: '0 0 10px rgba(0,212,255,0.1)' },
};

const VENDORS = [
  { key: 'all', label: 'All' },
  { key: 'Amazon Normal', label: 'Amazon Normal' },
  { key: 'Balyo', label: 'Balyo' },
  { key: 'Amazon Internal', label: 'Amazon Internal' },
];

const SEVERITIES = [
  { key: 'all', label: 'All', color: '#a0a0b0' },
  { key: 'critical', label: 'Critical', color: '#ff3b3b' },
  { key: 'warning', label: 'Warning', color: '#ffb800' },
  { key: 'info', label: 'Info', color: '#00d4ff' },
];

function ErrorCard({ entry }: { entry: ErrorCodeEntry }) {
  const [expanded, setExpanded] = useState(false);
  const style = SEVERITY_STYLE[entry.severity] || SEVERITY_STYLE.info;

  return (
    <div className="mx-5 mb-3 rounded-xl border border-white/[0.04] bg-[#1a1a25] p-5 hover:border-white/[0.08] transition-all duration-200"
         style={{ boxShadow: expanded ? style.glow : 'none' }}>
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2.5">
            <span className="font-mono text-sm font-bold text-white" style={{ textShadow: `0 0 8px ${style.color}30` }}>{entry.code}</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/[0.04] text-[#606070] font-medium">
              {entry.vendor}
            </span>
          </div>
          <div className="text-sm text-[#a0a0b0] mt-1">{entry.name}</div>
        </div>
        <span className="text-[10px] uppercase font-bold tracking-[0.1em] px-2 py-0.5 rounded-md flex-shrink-0"
              style={{ color: style.color, backgroundColor: style.bg }}>
          {entry.severity}
        </span>
      </div>

      <p className="text-xs text-[#606070] mt-2.5 leading-relaxed">{entry.description}</p>

      {expanded && (
        <div className="mt-4 space-y-4 animate-fade-in">
          <div>
            <h4 className="text-[10px] font-semibold text-[#a0a0b0] mb-2 uppercase tracking-[0.15em]">Common Causes</h4>
            <ul className="space-y-1">
              {entry.common_causes.map((c, i) => (
                <li key={i} className="text-xs text-[#606070] flex gap-2">
                  <span className="text-[#00d4ff]/30 mt-0.5">▸</span> {c}
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h4 className="text-[10px] font-semibold text-[#a0a0b0] mb-2 uppercase tracking-[0.15em]">Remediation Steps</h4>
            <ol className="space-y-1">
              {entry.remediation_steps.map((s, i) => (
                <li key={i} className="text-xs text-[#606070] flex gap-2">
                  <span className="text-[#00ff88]/40 tabular-nums font-medium">{i + 1}.</span> {s}
                </li>
              ))}
            </ol>
          </div>

          <div className="flex items-center gap-5 text-xs">
            <span className="text-[#606070]">
              Auto-recoverable: {entry.auto_recoverable
                ? <span className="text-[#00ff88] text-glow-green font-medium">Yes</span>
                : <span className="text-[#ff3b3b] text-glow-red font-medium">No</span>}
            </span>
            {entry.related_errors.length > 0 && (
              <span className="text-[#606070]">
                Related: <span className="text-[#a0a0b0]">{entry.related_errors.join(', ')}</span>
              </span>
            )}
          </div>

          {entry.equivalent_errors && entry.equivalent_errors.length > 0 && (
            <div>
              <h4 className="text-[10px] font-semibold text-[#a0a0b0] mb-2 uppercase tracking-[0.15em]">Cross-Vendor Equivalents</h4>
              {entry.equivalent_errors.map((eq, i) => (
                <div key={i} className="text-xs text-[#606070]">
                  <span className="text-white font-mono">{eq.code}</span>
                  <span className="text-[#606070] mx-1">({eq.vendor})</span>
                  <span className="text-[#a0a0b0]">{eq.name}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <button
        onClick={() => setExpanded(!expanded)}
        className="mt-3 text-xs text-[#a0a0b0] hover:text-[#00d4ff] transition-colors"
      >
        {expanded ? '← Less' : 'More →'}
      </button>
    </div>
  );
}

export default function ErrorLookup() {
  const { dispatch } = useFleet();
  const [query, setQuery] = useState('');
  const [allErrors, setAllErrors] = useState<ErrorCodeEntry[]>([]);
  const [searchFocused, setSearchFocused] = useState(false);
  const [vendorFilter, setVendorFilter] = useState('all');
  const [severityFilter, setSeverityFilter] = useState('all');

  useEffect(() => {
    api.get('/errors').then(({ data }) => setAllErrors(data)).catch(console.error);
  }, []);

  // Client-side filtering: vendor + severity + text search
  const filteredResults = useMemo(() => {
    let results = allErrors;

    // Vendor filter
    if (vendorFilter !== 'all') {
      results = results.filter(e => e.vendor === vendorFilter);
    }

    // Severity filter
    if (severityFilter !== 'all') {
      results = results.filter(e => e.severity === severityFilter);
    }

    // Text search
    if (query.trim()) {
      const lower = query.toLowerCase();
      results = results.filter(e =>
        e.code.toLowerCase().includes(lower) ||
        e.name.toLowerCase().includes(lower) ||
        e.vendor.toLowerCase().includes(lower) ||
        e.description.toLowerCase().includes(lower)
      );
    }

    return results;
  }, [allErrors, vendorFilter, severityFilter, query]);

  // Severity counts (for the active vendor filter)
  const severityCounts = useMemo(() => {
    let base = allErrors;
    if (vendorFilter !== 'all') {
      base = base.filter(e => e.vendor === vendorFilter);
    }
    return {
      all: base.length,
      critical: base.filter(e => e.severity === 'critical').length,
      warning: base.filter(e => e.severity === 'warning').length,
      info: base.filter(e => e.severity === 'info').length,
    };
  }, [allErrors, vendorFilter]);

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="px-6 py-4 border-b border-white/[0.06] flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-[#ff3b3b] shadow-[0_0_8px_#ff3b3b]" />
          <span className="text-sm font-semibold text-white tracking-wide">Error Codes</span>
          <span className="text-[10px] text-[#606070] tabular-nums ml-1">{allErrors.length} total</span>
        </div>
        <button
          onClick={() => dispatch({ type: 'SET_RIGHT_PANEL_VIEW', view: 'alerts' })}
          className="text-xs text-[#606070] hover:text-[#a0a0b0] transition-colors"
        >
          ← Alerts
        </button>
      </div>

      {/* Search */}
      <div className="px-5 py-3.5 border-b border-white/[0.06]">
        <input
          type="text" value={query}
          onChange={e => setQuery(e.target.value)}
          onFocus={() => setSearchFocused(true)}
          onBlur={() => setSearchFocused(false)}
          placeholder="Search error code or keyword..."
          className={`w-full bg-[#1a1a25] text-sm text-white rounded-lg px-4 py-2.5 placeholder:text-[#606070] focus:outline-none border transition-all duration-300 ${
            searchFocused ? 'border-[#ff3b3b]/20 shadow-[0_0_12px_rgba(255,59,59,0.08)]' : 'border-white/[0.06]'
          }`}
        />

        {/* Vendor filter pills */}
        <div className="flex gap-1.5 mt-2.5">
          {VENDORS.map(v => (
            <button
              key={v.key}
              onClick={() => setVendorFilter(v.key)}
              className={`text-[10px] px-2.5 py-1 rounded-md border transition-all duration-200 ${
                vendorFilter === v.key
                  ? 'text-white bg-white/[0.06] border-white/[0.15]'
                  : 'text-[#a0a0b0] border-white/[0.04] hover:border-white/[0.10] hover:bg-white/[0.02]'
              }`}
            >
              {v.label}
            </button>
          ))}
        </div>

        {/* Severity filter pills */}
        <div className="flex gap-1.5 mt-2">
          {SEVERITIES.map(s => (
            <button
              key={s.key}
              onClick={() => setSeverityFilter(s.key)}
              className={`text-[10px] px-2.5 py-1 rounded-md border transition-all duration-200 flex items-center gap-1.5 ${
                severityFilter === s.key
                  ? 'border-white/[0.15] bg-white/[0.06]'
                  : 'border-white/[0.04] hover:border-white/[0.10] hover:bg-white/[0.02]'
              }`}
              style={severityFilter === s.key ? { color: s.color, textShadow: `0 0 8px ${s.color}40` } : { color: '#a0a0b0' }}
            >
              {s.key !== 'all' && (
                <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: s.color }} />
              )}
              {s.label}
              <span className="tabular-nums opacity-60">
                ({severityCounts[s.key as keyof typeof severityCounts] ?? 0})
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Results */}
      <div className="flex-1 overflow-y-auto py-3">
        {filteredResults.length === 0 ? (
          <div className="text-center py-10 text-[#606070] text-sm">
            {allErrors.length === 0
              ? 'Loading error codes...'
              : <>No error codes match the current filters</>
            }
          </div>
        ) : (
          <>
            <div className="px-5 py-1.5 text-[11px] text-[#606070] tabular-nums">
              {filteredResults.length} error code{filteredResults.length !== 1 ? 's' : ''}
              {vendorFilter !== 'all' && <span className="text-[#a0a0b0]"> · {vendorFilter}</span>}
              {severityFilter !== 'all' && <span style={{ color: SEVERITIES.find(s => s.key === severityFilter)?.color }}> · {severityFilter}</span>}
            </div>
            {filteredResults.map(entry => <ErrorCard key={entry.code} entry={entry} />)}
          </>
        )}
      </div>
    </div>
  );
}

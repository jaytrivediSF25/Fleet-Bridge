import { useState } from 'react';
import { useFleet } from '../../context/FleetContext';
import DailySummary from './DailySummary';
import VendorComparison from './VendorComparison';
import RobotPerformanceView from './RobotPerformance';
import ZoneAnalysis from './ZoneAnalysis';

const TABS = [
  { key: 'summary', label: 'Summary', icon: '◇' },
  { key: 'vendors', label: 'Vendors', icon: '⧫' },
  { key: 'robots', label: 'Robots', icon: '●' },
  { key: 'zones', label: 'Zones', icon: '▢' },
];

export default function AnalyticsOverlay() {
  const { dispatch } = useFleet();
  const [activeTab, setActiveTab] = useState('summary');

  return (
    <div className="fixed inset-0 z-[60] bg-[#0a0a0f]/95 backdrop-blur-2xl flex flex-col animate-fade-in">
      {/* Grid overlay */}
      <div className="absolute inset-0 grid-overlay pointer-events-none" />

      {/* Header */}
      <div className="h-16 flex-shrink-0 flex items-center justify-between px-8 border-b border-white/[0.06] relative z-10">
        <div className="flex items-center gap-8">
          <h1 className="text-lg font-bold text-white tracking-wide">
            <span className="text-[#00d4ff] text-glow-cyan">◆</span> Analytics
          </h1>
          <div className="flex gap-1">
            {TABS.map(tab => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`px-4 py-2 text-xs font-medium rounded-lg transition-all duration-200 ${
                  activeTab === tab.key
                    ? 'bg-[#00d4ff]/10 text-[#00d4ff] border border-[#00d4ff]/20 shadow-[0_0_12px_rgba(0,212,255,0.1)]'
                    : 'text-[#606070] hover:text-[#a0a0b0] hover:bg-white/[0.03]'
                }`}
              >
                <span className="mr-1.5">{tab.icon}</span>{tab.label}
              </button>
            ))}
          </div>
        </div>
        <button
          onClick={() => dispatch({ type: 'TOGGLE_ANALYTICS_OVERLAY' })}
          className="text-[#606070] hover:text-white transition-colors group"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
               className="group-hover:rotate-90 transition-transform duration-200">
            <path d="M18 6 6 18M6 6l12 12"/>
          </svg>
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto relative z-10">
        <div className="max-w-5xl mx-auto px-16 py-8">
          {activeTab === 'summary' && <DailySummary />}
          {activeTab === 'vendors' && <VendorComparison />}
          {activeTab === 'robots' && <RobotPerformanceView />}
          {activeTab === 'zones' && <ZoneAnalysis />}
        </div>
      </div>
    </div>
  );
}

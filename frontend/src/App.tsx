import { useEffect } from 'react';
import { FleetProvider, useFleet } from './context/FleetContext';
import { useWebSocket } from './hooks/useWebSocket';
import TopBar from './components/TopBar';
import BottomBar from './components/BottomBar';
import LiveMap from './components/LiveMap';
import RightPanel from './components/RightPanel';
import RobotDetail from './components/RobotDetail';
import AnalyticsOverlay from './components/Analytics/AnalyticsOverlay';
import TaskAssignModal from './components/TaskAssignModal';
import ViewPathWindow from './components/ViewPathWindow';
import api from './lib/api';
import type { Facility, CatalogTask } from './types/robot';

function AppContent() {
  const { state, dispatch } = useFleet();
  useWebSocket();

  useEffect(() => {
    api.get<Facility>('/facility').then(({ data }) => {
      dispatch({ type: 'SET_FACILITY', facility: data });
    }).catch(console.error);

    api.get<CatalogTask[]>('/task-catalog').then(({ data }) => {
      dispatch({ type: 'SET_TASK_CATALOG', catalog: data });
    }).catch(console.error);
  }, [dispatch]);

  // Auto-clear charge path when robot starts charging or arrives
  useEffect(() => {
    if (!state.chargePath) return;
    const robot = state.robots.find(r => r.id === state.chargePath!.robotId);
    if (!robot) return;

    // Clear when robot is charging (arrived at charger)
    if (robot.status === 'charging') {
      dispatch({ type: 'SET_CHARGE_PATH', path: null });
      return;
    }

    // Clear when robot is close to the target (within 2 units)
    const dx = robot.position.x - state.chargePath.to.x;
    const dy = robot.position.y - state.chargePath.to.y;
    if (dx * dx + dy * dy < 4) {
      dispatch({ type: 'SET_CHARGE_PATH', path: null });
    }
  }, [state.robots, state.chargePath, dispatch]);

  return (
    <div className="h-screen bg-[#0a0a0f] text-white overflow-hidden relative">
      {/* Ambient grid overlay */}
      <div className="absolute inset-0 grid-overlay z-0" />

      {/* Subtle vignette */}
      <div className="absolute inset-0 pointer-events-none z-0"
           style={{ background: 'radial-gradient(ellipse at center, transparent 50%, rgba(0,0,0,0.4) 100%)' }} />

      {/* Top Bar — 64px, glassmorphism */}
      <div className="relative z-50">
        <TopBar />
      </div>

      {/* Main Content */}
      <div className="flex relative z-10" style={{ height: 'calc(100vh - 64px - 56px)' }}>
        {/* Center — Factory Map (the HERO) */}
        <div className="flex-1 relative min-w-0 scanlines">
          <LiveMap />
        </div>

        {/* Right Panel — 380px, glassmorphism */}
        <aside className="w-[380px] flex-shrink-0 relative glass-dark overflow-hidden">
          {state.showRobotDetail && state.selectedRobotId ? (
            <RobotDetail />
          ) : (
            <RightPanel />
          )}
        </aside>
      </div>

      {/* Bottom Bar — 56px */}
      <div className="relative z-40">
        <BottomBar />
      </div>

      {/* Analytics Full-Screen Overlay */}
      {state.showAnalyticsOverlay && <AnalyticsOverlay />}

      {/* Task Assignment Modal */}
      {state.assignTaskRobotId && <TaskAssignModal />}

      {/* View Path Mini-Window */}
      {state.viewPathRobotId && <ViewPathWindow />}
    </div>
  );
}

function App() {
  return (
    <FleetProvider>
      <AppContent />
    </FleetProvider>
  );
}

export default App;

import { useFleet } from '../context/FleetContext';
import AlertFeed from './AlertFeed';
import ChatResponsePanel from './ChatResponsePanel';
import ChatPanel from './ChatPanel';
import ErrorLookup from './ErrorLookup';

export default function RightPanel() {
  const { state } = useFleet();

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {state.rightPanelView === 'chat-response' ? (
        <ChatResponsePanel />
      ) : state.rightPanelView === 'chat' ? (
        <ChatPanel />
      ) : state.rightPanelView === 'errors' ? (
        <ErrorLookup />
      ) : (
        <AlertFeed />
      )}
    </div>
  );
}

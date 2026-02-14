import { useEffect, useRef, useCallback } from 'react';
import { useFleet } from '../context/FleetContext';
import type { FleetUpdate } from '../types/robot';

export function useWebSocket() {
  const { dispatch } = useFleet();
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout>>();

  const connect = useCallback(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws/fleet`;

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log('WebSocket connected');
      dispatch({ type: 'SET_CONNECTION_LOST', lost: false });
    };

    ws.onmessage = (event) => {
      try {
        const update: FleetUpdate = JSON.parse(event.data);
        dispatch({ type: 'SET_ROBOTS', robots: update.robots });
        dispatch({ type: 'SET_ALERTS', alerts: update.alerts });
      } catch (e) {
        console.error('Failed to parse WebSocket message:', e);
      }
    };

    ws.onclose = () => {
      console.log('WebSocket disconnected, reconnecting...');
      dispatch({ type: 'SET_CONNECTION_LOST', lost: true });
      reconnectTimer.current = setTimeout(connect, 2000);
    };

    ws.onerror = (err) => {
      console.error('WebSocket error:', err);
      ws.close();
    };
  }, [dispatch]);

  useEffect(() => {
    connect();
    return () => {
      if (wsRef.current) wsRef.current.close();
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
    };
  }, [connect]);

  const sendCommand = useCallback((robotId: string, command: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'command', robot_id: robotId, command }));
    }
  }, []);

  return { sendCommand };
}

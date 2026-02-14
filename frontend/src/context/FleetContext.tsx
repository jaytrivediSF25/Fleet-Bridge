import React, { createContext, useContext, useReducer, ReactNode } from 'react';
import type { Robot, Alert, Facility, ChatMessage, Position, CatalogTask } from '../types/robot';

// --- State ---
export interface ChargePath {
  robotId: string;
  from: Position;
  to: Position;
  chargerName: string;
}

export interface TaskPath {
  robotId: string;
  from: Position;
  to: Position;
}

interface FleetState {
  robots: Robot[];
  alerts: Alert[];
  facility: Facility | null;
  selectedRobotId: string | null;
  showRobotDetail: boolean;

  // Filters
  filterVendor: string;
  filterStatus: string;
  filterZone: string;
  searchQuery: string;

  // Map
  followRobotId: string | null;
  mapZoom: number;
  mapOffset: { x: number; y: number };
  showGrid: boolean;
  showZoneLabels: boolean;

  // UI state
  showAnalyticsOverlay: boolean;
  showStatusExpanded: boolean;
  connectionLost: boolean;

  // NL query inline response (TopBar)
  nlQueryResponse: {
    query: string;
    response: string;
    robotIds: string[];
    followups: string[];
    responseType: string;
  } | null;

  // Right panel context: 'alerts' | 'chat-response' | 'chat' | 'errors'
  rightPanelView: 'alerts' | 'chat-response' | 'chat' | 'errors';

  // Chat messages displayed in right panel
  chatMessages: ChatMessage[];

  // Charge path visualization (red dotted line to charger)
  chargePath: ChargePath | null;

  // View path mini-window
  viewPathRobotId: string | null;

  // Task assignment modal
  assignTaskRobotId: string | null;

  // Task catalog
  taskCatalog: CatalogTask[];
}

const initialState: FleetState = {
  robots: [],
  alerts: [],
  facility: null,
  selectedRobotId: null,
  showRobotDetail: false,

  filterVendor: 'All',
  filterStatus: 'All',
  filterZone: 'All',
  searchQuery: '',

  followRobotId: null,
  mapZoom: 1,
  mapOffset: { x: 0, y: 0 },
  showGrid: false,
  showZoneLabels: true,

  showAnalyticsOverlay: false,
  showStatusExpanded: false,
  connectionLost: false,

  nlQueryResponse: null,
  rightPanelView: 'alerts',
  chatMessages: [],

  chargePath: null,
  viewPathRobotId: null,
  assignTaskRobotId: null,
  taskCatalog: [],
};

// --- Actions ---
type Action =
  | { type: 'SET_ROBOTS'; robots: Robot[] }
  | { type: 'SET_ALERTS'; alerts: Alert[] }
  | { type: 'SET_FACILITY'; facility: Facility }
  | { type: 'SELECT_ROBOT'; robotId: string | null }
  | { type: 'SET_FILTER_VENDOR'; vendor: string }
  | { type: 'SET_FILTER_STATUS'; status: string }
  | { type: 'SET_FILTER_ZONE'; zone: string }
  | { type: 'SET_SEARCH'; query: string }
  | { type: 'SET_SHOW_ROBOT_DETAIL'; show: boolean }
  | { type: 'SET_FOLLOW_ROBOT'; robotId: string | null }
  | { type: 'SET_MAP_ZOOM'; zoom: number }
  | { type: 'SET_MAP_OFFSET'; offset: { x: number; y: number } }
  | { type: 'TOGGLE_GRID' }
  | { type: 'TOGGLE_ZONE_LABELS' }
  | { type: 'TOGGLE_ANALYTICS_OVERLAY' }
  | { type: 'TOGGLE_STATUS_EXPANDED' }
  | { type: 'SET_CONNECTION_LOST'; lost: boolean }
  | { type: 'SET_NL_QUERY_RESPONSE'; response: { query: string; response: string; robotIds: string[]; followups: string[]; responseType: string } | null }
  | { type: 'SET_RIGHT_PANEL_VIEW'; view: 'alerts' | 'chat-response' | 'chat' | 'errors' }
  | { type: 'ADD_CHAT_MESSAGE'; message: ChatMessage }
  | { type: 'CLEAR_CHAT' }
  | { type: 'SET_CHARGE_PATH'; path: ChargePath | null }
  | { type: 'SET_VIEW_PATH_ROBOT'; robotId: string | null }
  | { type: 'SET_ASSIGN_TASK_ROBOT'; robotId: string | null }
  | { type: 'SET_TASK_CATALOG'; catalog: CatalogTask[] };

function reducer(state: FleetState, action: Action): FleetState {
  switch (action.type) {
    case 'SET_ROBOTS':
      return { ...state, robots: action.robots };
    case 'SET_ALERTS':
      return { ...state, alerts: action.alerts };
    case 'SET_FACILITY':
      return { ...state, facility: action.facility };
    case 'SELECT_ROBOT':
      return {
        ...state,
        selectedRobotId: action.robotId,
        showRobotDetail: action.robotId !== null,
      };
    case 'SET_FILTER_VENDOR':
      return { ...state, filterVendor: action.vendor };
    case 'SET_FILTER_STATUS':
      return { ...state, filterStatus: action.status };
    case 'SET_FILTER_ZONE':
      return { ...state, filterZone: action.zone };
    case 'SET_SEARCH':
      return { ...state, searchQuery: action.query };
    case 'SET_SHOW_ROBOT_DETAIL':
      return { ...state, showRobotDetail: action.show };
    case 'SET_FOLLOW_ROBOT':
      return { ...state, followRobotId: action.robotId };
    case 'SET_MAP_ZOOM':
      return { ...state, mapZoom: action.zoom };
    case 'SET_MAP_OFFSET':
      return { ...state, mapOffset: action.offset };
    case 'TOGGLE_GRID':
      return { ...state, showGrid: !state.showGrid };
    case 'TOGGLE_ZONE_LABELS':
      return { ...state, showZoneLabels: !state.showZoneLabels };
    case 'TOGGLE_ANALYTICS_OVERLAY':
      return { ...state, showAnalyticsOverlay: !state.showAnalyticsOverlay };
    case 'TOGGLE_STATUS_EXPANDED':
      return { ...state, showStatusExpanded: !state.showStatusExpanded };
    case 'SET_CONNECTION_LOST':
      return { ...state, connectionLost: action.lost };
    case 'SET_NL_QUERY_RESPONSE':
      return { ...state, nlQueryResponse: action.response };
    case 'SET_RIGHT_PANEL_VIEW':
      return { ...state, rightPanelView: action.view, showRobotDetail: false };
    case 'ADD_CHAT_MESSAGE':
      return { ...state, chatMessages: [...state.chatMessages, action.message] };
    case 'CLEAR_CHAT':
      return { ...state, chatMessages: [] };
    case 'SET_CHARGE_PATH':
      return { ...state, chargePath: action.path };
    case 'SET_VIEW_PATH_ROBOT':
      return { ...state, viewPathRobotId: action.robotId };
    case 'SET_ASSIGN_TASK_ROBOT':
      return { ...state, assignTaskRobotId: action.robotId };
    case 'SET_TASK_CATALOG':
      return { ...state, taskCatalog: action.catalog };
    default:
      return state;
  }
}

// --- Context ---
interface FleetContextType {
  state: FleetState;
  dispatch: React.Dispatch<Action>;
}

const FleetContext = createContext<FleetContextType | undefined>(undefined);

export function FleetProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);
  return (
    <FleetContext.Provider value={{ state, dispatch }}>
      {children}
    </FleetContext.Provider>
  );
}

export function useFleet() {
  const context = useContext(FleetContext);
  if (!context) throw new Error('useFleet must be used within FleetProvider');
  return context;
}

// Types matching backend Pydantic models

export type RobotStatus = 'active' | 'idle' | 'error' | 'charging' | 'offline';
export type AlertSeverity = 'critical' | 'warning' | 'info' | 'resolved';
export type AlertType = 'deadlock' | 'collision_course' | 'congestion' | 'battery_critical' | 'path_blocked' | 'error';
export type TaskType = 'pickup' | 'delivery' | 'transport' | 'charging' | string;
export type TaskStatus = 'in_progress' | 'completed' | 'failed' | 'cancelled';
export type ErrorSeverityLevel = 'critical' | 'warning' | 'info';

export interface Position {
  x: number;
  y: number;
}

export interface Task {
  task_id: string;
  task_type: TaskType;
  from_station: string;
  to_station: string;
  status: TaskStatus;
  started_at: string;
  completed_at?: string;
  eta_seconds?: number;
}

export interface ActivityEntry {
  timestamp: string;
  description: string;
  activity_type: string;
}

export interface ErrorInfo {
  error_code: string;
  vendor_code: string;
  name: string;
  description: string;
  timestamp: string;
  resolved: boolean;
  resolved_at?: string;
}

export interface Robot {
  id: string;
  name: string;
  vendor: string;
  model: string;
  position: Position;
  heading: number;
  speed: number;
  status: RobotStatus;
  battery: number;
  current_task?: Task;
  recent_activity: ActivityEntry[];
  last_error?: ErrorInfo;
  trail: Position[];
  zone: string;
  last_updated: string;
}

export interface Alert {
  id: string;
  alert_type: AlertType;
  severity: AlertSeverity;
  title: string;
  description: string;
  affected_robots: string[];
  suggested_action: string;
  position?: Position;
  rca_analysis?: string;
  acknowledged: boolean;
  resolved: boolean;
  created_at: string;
  acknowledged_at?: string;
  resolved_at?: string;
}

export interface FleetUpdate {
  robots: Robot[];
  alerts: Alert[];
  timestamp: string;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  robot_ids: string[];
  suggested_followups: string[];
}

export interface ChatResponse {
  response: string;
  conversation_id: string;
  robot_ids: string[];
  suggested_followups: string[];
  response_type?: 'status' | 'analysis' | 'recommendation' | 'error_lookup' | 'action';
}

// Analytics
export interface DailySummary {
  total_tasks: number;
  total_distance_km: number;
  avg_task_time_min: number;
  uptime_percent: number;
  tasks_by_hour: Record<string, number>;
  top_errors: { code: string; name: string; count: number }[];
  tasks_change_percent: number;
  distance_change_percent: number;
  time_change_min: number;
  uptime_change_percent: number;
}

export interface VendorMetrics {
  vendor: string;
  robot_count: number;
  total_tasks: number;
  tasks_per_robot: number;
  avg_task_time_min: number;
  total_errors: number;
  error_rate_percent: number;
  uptime_percent: number;
  avg_battery: number;
}

export interface RobotPerformance {
  robot_id: string;
  vendor: string;
  tasks_completed: number;
  avg_task_time_min: number;
  error_count: number;
  uptime_percent: number;
  is_top_performer: boolean;
  needs_attention: boolean;
}

export interface ZoneMetrics {
  zone: string;
  task_count: number;
  error_count: number;
  avg_wait_time_min: number;
  robot_count: number;
  activity_level: string;
}

export interface ErrorCodeEntry {
  code: string;
  vendor: string;
  models: string;
  name: string;
  description: string;
  common_causes: string[];
  remediation_steps: string[];
  severity: ErrorSeverityLevel;
  auto_recoverable: boolean;
  related_errors: string[];
  keywords: string[];
  equivalent_errors?: ErrorCodeEntry[];
}

export interface Facility {
  grid_width: number;
  grid_height: number;
  zones: Record<string, { x_min: number; x_max: number; y_min: number; y_max: number }>;
  stations: Record<string, Position>;
  charging_stations: Record<string, Position>;
}

// Task catalog
export interface CatalogTask {
  id: string;       // e.g. "move_pod"
  name: string;     // "Move Inventory Pod"
  category: string; // "Inventory Movement"
  icon: string;     // emoji
  description: string;
  vendors: string[];
}

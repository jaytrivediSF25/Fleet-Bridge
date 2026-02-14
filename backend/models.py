"""
Pydantic models for FleetBridge unified robot fleet management.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from enum import Enum
from typing import Optional

from pydantic import BaseModel, Field


# --- Enums ---

class RobotStatus(str, Enum):
    ACTIVE = "active"
    IDLE = "idle"
    ERROR = "error"
    CHARGING = "charging"
    OFFLINE = "offline"


class AlertSeverity(str, Enum):
    CRITICAL = "critical"
    WARNING = "warning"
    INFO = "info"
    RESOLVED = "resolved"


class AlertType(str, Enum):
    DEADLOCK = "deadlock"
    COLLISION_COURSE = "collision_course"
    CONGESTION = "congestion"
    BATTERY_CRITICAL = "battery_critical"
    PATH_BLOCKED = "path_blocked"
    ERROR = "error"


class TaskType(str, Enum):
    PICKUP = "pickup"
    DELIVERY = "delivery"
    TRANSPORT = "transport"
    CHARGING = "charging"


class TaskStatus(str, Enum):
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


class ErrorSeverity(str, Enum):
    CRITICAL = "critical"
    WARNING = "warning"
    INFO = "info"


# --- Core Models ---

class Position(BaseModel):
    x: float
    y: float


class Task(BaseModel):
    task_id: str
    task_type: TaskType
    from_station: str
    to_station: str
    status: TaskStatus = TaskStatus.IN_PROGRESS
    started_at: datetime
    completed_at: Optional[datetime] = None
    eta_seconds: Optional[float] = None


class ActivityEntry(BaseModel):
    timestamp: datetime
    description: str
    activity_type: str  # "task_started", "task_completed", "error", "charging", etc.


class ErrorInfo(BaseModel):
    error_code: str
    vendor_code: str  # original vendor error code
    name: str
    description: str
    timestamp: datetime
    resolved: bool = False
    resolved_at: Optional[datetime] = None


class UnifiedRobotState(BaseModel):
    id: str
    name: str
    vendor: str
    model: str
    position: Position
    heading: float = 0.0  # degrees 0-360
    speed: float = 0.0  # m/s
    status: RobotStatus = RobotStatus.IDLE
    battery: float = 100.0  # 0-100
    current_task: Optional[Task] = None
    recent_activity: list[ActivityEntry] = Field(default_factory=list)
    last_error: Optional[ErrorInfo] = None
    trail: list[Position] = Field(default_factory=list)
    zone: str = ""
    last_updated: datetime = Field(default_factory=datetime.now)


# --- Alert Models ---

class Alert(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4())[:8])
    alert_type: AlertType
    severity: AlertSeverity
    title: str
    description: str
    affected_robots: list[str]  # robot IDs
    suggested_action: str
    position: Optional[Position] = None
    rca_analysis: Optional[str] = None  # root cause analysis text
    acknowledged: bool = False
    resolved: bool = False
    created_at: datetime = Field(default_factory=datetime.now)
    acknowledged_at: Optional[datetime] = None
    resolved_at: Optional[datetime] = None


# --- Chat Models ---

class ChatMessage(BaseModel):
    role: str  # "user" or "assistant"
    content: str
    timestamp: datetime = Field(default_factory=datetime.now)
    robot_ids: list[str] = Field(default_factory=list)  # referenced robots for "Show on Map"
    suggested_followups: list[str] = Field(default_factory=list)


class ChatRequest(BaseModel):
    query: str
    conversation_id: Optional[str] = None


class ChatResponse(BaseModel):
    response: str
    conversation_id: str
    robot_ids: list[str] = Field(default_factory=list)
    suggested_followups: list[str] = Field(default_factory=list)
    response_type: str = "status"  # status, analysis, recommendation, error_lookup, action


# --- Analytics Models ---

class DailySummary(BaseModel):
    total_tasks: int = 0
    total_distance_km: float = 0.0
    avg_task_time_min: float = 0.0
    uptime_percent: float = 0.0
    tasks_by_hour: dict[int, int] = Field(default_factory=dict)  # hour -> count
    top_errors: list[dict] = Field(default_factory=list)  # [{code, name, count}]
    tasks_change_percent: float = 0.0
    distance_change_percent: float = 0.0
    time_change_min: float = 0.0
    uptime_change_percent: float = 0.0


class VendorMetrics(BaseModel):
    vendor: str
    robot_count: int = 0
    total_tasks: int = 0
    tasks_per_robot: float = 0.0
    avg_task_time_min: float = 0.0
    total_errors: int = 0
    error_rate_percent: float = 0.0
    uptime_percent: float = 0.0
    avg_battery: float = 0.0


class RobotPerformance(BaseModel):
    robot_id: str
    vendor: str
    tasks_completed: int = 0
    avg_task_time_min: float = 0.0
    error_count: int = 0
    uptime_percent: float = 0.0
    is_top_performer: bool = False
    needs_attention: bool = False


class ZoneMetrics(BaseModel):
    zone: str
    task_count: int = 0
    error_count: int = 0
    avg_wait_time_min: float = 0.0
    robot_count: int = 0
    activity_level: str = "low"  # low, medium, high, very_high


# --- Error Knowledge Base Models ---

class ErrorCodeEntry(BaseModel):
    code: str
    vendor: str
    models: str  # "All Amazon AMRs", etc.
    name: str
    description: str
    common_causes: list[str]
    remediation_steps: list[str]
    severity: ErrorSeverity
    auto_recoverable: bool = False
    related_errors: list[str] = Field(default_factory=list)
    keywords: list[str] = Field(default_factory=list)  # for search


# --- WebSocket Models ---

class FleetUpdate(BaseModel):
    robots: list[UnifiedRobotState]
    alerts: list[Alert]
    timestamp: datetime = Field(default_factory=datetime.now)

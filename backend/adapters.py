"""
Vendor adapter classes that normalize vendor-specific robot data into the unified schema.
Each vendor has its own raw data format. Adapters convert to UnifiedRobotState.
"""

from __future__ import annotations

import math
from datetime import datetime
from typing import Any

from models import (
    ActivityEntry,
    ErrorInfo,
    Position,
    RobotStatus,
    Task,
    TaskStatus,
    TaskType,
    UnifiedRobotState,
)
from facility import get_zone_for_position


class BaseAdapter:
    """Base class for vendor adapters."""

    vendor_name: str = ""
    model_name: str = ""

    def normalize(self, raw: dict[str, Any]) -> UnifiedRobotState:
        raise NotImplementedError


class AmazonRoboticsAdapter(BaseAdapter):
    """
    Amazon Normal adapter.
    Raw format:
      position: {"x": 12.5, "y": 8.3}
      status: int (0=idle, 1=active, 2=error, 3=charging, 4=offline)
      battery: float 0-100
      heading: float degrees
      speed: float m/s
    """

    vendor_name = "Amazon Normal"
    model_name = "Proteus AMR"

    STATUS_MAP = {
        0: RobotStatus.IDLE,
        1: RobotStatus.ACTIVE,
        2: RobotStatus.ERROR,
        3: RobotStatus.CHARGING,
        4: RobotStatus.OFFLINE,
    }

    def normalize(self, raw: dict[str, Any]) -> UnifiedRobotState:
        pos = Position(x=raw["position"]["x"], y=raw["position"]["y"])
        status = self.STATUS_MAP.get(raw.get("status_code", 0), RobotStatus.IDLE)

        current_task = None
        if raw.get("task"):
            t = raw["task"]
            current_task = Task(
                task_id=t["task_id"],
                task_type=TaskType(t.get("task_type", "transport")),
                from_station=t["from_station"],
                to_station=t["to_station"],
                status=TaskStatus(t.get("status", "in_progress")),
                started_at=t["started_at"],
                eta_seconds=t.get("eta_seconds"),
            )

        last_error = None
        if raw.get("last_error"):
            e = raw["last_error"]
            last_error = ErrorInfo(
                error_code=e["error_code"],
                vendor_code=e["error_code"],
                name=e.get("name", "Unknown"),
                description=e.get("description", ""),
                timestamp=e["timestamp"],
                resolved=e.get("resolved", False),
            )

        trail = [Position(x=p["x"], y=p["y"]) for p in raw.get("trail", [])]
        activity = [
            ActivityEntry(
                timestamp=a["timestamp"],
                description=a["description"],
                activity_type=a["type"],
            )
            for a in raw.get("activity", [])
        ]

        return UnifiedRobotState(
            id=raw["robot_id"],
            name=raw["robot_id"],
            vendor=self.vendor_name,
            model=self.model_name,
            position=pos,
            heading=raw.get("heading", 0.0),
            speed=raw.get("speed", 0.0),
            status=status,
            battery=raw.get("battery", 100.0),
            current_task=current_task,
            recent_activity=activity,
            last_error=last_error,
            trail=trail,
            zone=get_zone_for_position(pos.x, pos.y),
            last_updated=datetime.now(),
        )


class BalyoAdapter(BaseAdapter):
    """
    Balyo adapter.
    Raw format:
      position: {"lat": 0.35, "lng": 0.62} (normalized 0-1 grid fractions)
      status: string ("OPERATIONAL", "IDLE", "FAULT", "CHARGING", "OFFLINE")
      battery_pct: int 0-100
      orientation_deg: float
      velocity_mps: float
    """

    vendor_name = "Balyo"
    model_name = "Balyo B-Matic"

    STATUS_MAP = {
        "OPERATIONAL": RobotStatus.ACTIVE,
        "IDLE": RobotStatus.IDLE,
        "FAULT": RobotStatus.ERROR,
        "CHARGING": RobotStatus.CHARGING,
        "OFFLINE": RobotStatus.OFFLINE,
    }

    def normalize(self, raw: dict[str, Any]) -> UnifiedRobotState:
        # Locus uses lat/lng as grid-fraction coordinates: convert to actual grid
        from facility import GRID_WIDTH, GRID_HEIGHT
        raw_pos = raw["position"]
        pos = Position(
            x=raw_pos["lat"] * GRID_WIDTH,
            y=raw_pos["lng"] * GRID_HEIGHT,
        )
        status = self.STATUS_MAP.get(raw.get("status_str", "IDLE"), RobotStatus.IDLE)

        current_task = None
        if raw.get("task"):
            t = raw["task"]
            current_task = Task(
                task_id=t["task_id"],
                task_type=TaskType(t.get("task_type", "transport")),
                from_station=t["from_station"],
                to_station=t["to_station"],
                status=TaskStatus(t.get("status", "in_progress")),
                started_at=t["started_at"],
                eta_seconds=t.get("eta_seconds"),
            )

        last_error = None
        if raw.get("last_error"):
            e = raw["last_error"]
            last_error = ErrorInfo(
                error_code=e["error_code"],
                vendor_code=e["error_code"],
                name=e.get("name", "Unknown"),
                description=e.get("description", ""),
                timestamp=e["timestamp"],
                resolved=e.get("resolved", False),
            )

        trail = [
            Position(x=p["lat"] * GRID_WIDTH, y=p["lng"] * GRID_HEIGHT)
            for p in raw.get("trail", [])
        ]
        activity = [
            ActivityEntry(
                timestamp=a["timestamp"],
                description=a["description"],
                activity_type=a["type"],
            )
            for a in raw.get("activity", [])
        ]

        return UnifiedRobotState(
            id=raw["robot_id"],
            name=raw["robot_id"],
            vendor=self.vendor_name,
            model=self.model_name,
            position=pos,
            heading=raw.get("orientation_deg", 0.0),
            speed=raw.get("velocity_mps", 0.0),
            status=status,
            battery=raw.get("battery_pct", 100.0),
            current_task=current_task,
            recent_activity=activity,
            last_error=last_error,
            trail=trail,
            zone=get_zone_for_position(pos.x, pos.y),
            last_updated=datetime.now(),
        )


class AmazonInternalAdapter(BaseAdapter):
    """
    Amazon Internal adapter.
    Raw format:
      position: [row, col] array
      status: German string ("Bereit"=idle, "Aktiv"=active, "Fehler"=error,
              "Laden"=charging, "Offline"=offline)
      batterie: int 0-100
      richtung: float (heading in degrees)
      geschwindigkeit: float (speed in m/s)
    """

    vendor_name = "Amazon Internal"
    model_name = "Custom AGV-X"

    STATUS_MAP = {
        "Bereit": RobotStatus.IDLE,
        "Aktiv": RobotStatus.ACTIVE,
        "Fehler": RobotStatus.ERROR,
        "Laden": RobotStatus.CHARGING,
        "Offline": RobotStatus.OFFLINE,
    }

    def normalize(self, raw: dict[str, Any]) -> UnifiedRobotState:
        raw_pos = raw["position"]  # [row, col]
        pos = Position(x=float(raw_pos[1]), y=float(raw_pos[0]))
        status = self.STATUS_MAP.get(raw.get("status_de", "Bereit"), RobotStatus.IDLE)

        current_task = None
        if raw.get("task"):
            t = raw["task"]
            current_task = Task(
                task_id=t["task_id"],
                task_type=TaskType(t.get("task_type", "transport")),
                from_station=t["from_station"],
                to_station=t["to_station"],
                status=TaskStatus(t.get("status", "in_progress")),
                started_at=t["started_at"],
                eta_seconds=t.get("eta_seconds"),
            )

        last_error = None
        if raw.get("last_error"):
            e = raw["last_error"]
            last_error = ErrorInfo(
                error_code=e["error_code"],
                vendor_code=e["error_code"],
                name=e.get("name", "Unknown"),
                description=e.get("description", ""),
                timestamp=e["timestamp"],
                resolved=e.get("resolved", False),
            )

        trail = [Position(x=float(p[1]), y=float(p[0])) for p in raw.get("trail", [])]
        activity = [
            ActivityEntry(
                timestamp=a["timestamp"],
                description=a["description"],
                activity_type=a["type"],
            )
            for a in raw.get("activity", [])
        ]

        return UnifiedRobotState(
            id=raw["robot_id"],
            name=raw["robot_id"],
            vendor=self.vendor_name,
            model=self.model_name,
            position=pos,
            heading=raw.get("richtung", 0.0),
            speed=raw.get("geschwindigkeit", 0.0),
            status=status,
            battery=raw.get("batterie", 100.0),
            current_task=current_task,
            recent_activity=activity,
            last_error=last_error,
            trail=trail,
            zone=get_zone_for_position(pos.x, pos.y),
            last_updated=datetime.now(),
        )


# Adapter registry
ADAPTERS: dict[str, BaseAdapter] = {
    "Amazon Normal": AmazonRoboticsAdapter(),
    "Balyo": BalyoAdapter(),
    "Amazon Internal": AmazonInternalAdapter(),
}


def get_adapter(vendor: str) -> BaseAdapter:
    """Get the adapter for a given vendor."""
    adapter = ADAPTERS.get(vendor)
    if not adapter:
        raise ValueError(f"Unknown vendor: {vendor}")
    return adapter

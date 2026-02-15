"""
Robot fleet simulator for FleetBridge.
Simulates 24 robots across 3 vendors with different raw data formats.
Runs on a 500ms tick cycle. Generates realistic movement, task assignment,
battery drain, errors, and charging behavior.
"""

from __future__ import annotations

import asyncio
import math
import random
import uuid
from collections import deque
from datetime import datetime, timedelta
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
from adapters import get_adapter
from facility import (
    GRID_WIDTH,
    GRID_HEIGHT,
    STATIONS,
    CHARGING_STATIONS,
    ZONES,
    get_zone_for_position,
    get_nearest_charging_station,
    get_random_station_pair,
    distance,
)
from error_kb import AR_ERRORS, BALYO_ERRORS, AMZN_ERRORS
from task_catalog import CATALOG_BY_ID, get_tasks_for_vendor, get_task_stations


# --- Internal Robot State (vendor-specific raw data) ---

class RawRobot:
    """Internal state of a simulated robot with vendor-specific raw data."""

    def __init__(
        self,
        robot_id: str,
        vendor: str,
        x: float,
        y: float,
        battery: float = 100.0,
    ):
        self.robot_id = robot_id
        self.vendor = vendor
        self.x = x
        self.y = y
        self.battery = battery
        self.heading = random.uniform(0, 360)
        self.speed = 0.0
        self.status = RobotStatus.IDLE

        # Task
        self.task: dict | None = None
        self.task_destination: Position | None = None
        self.task_origin: Position | None = None

        # Trail (last 60 positions for 30s at 500ms ticks)
        self.trail: deque[tuple[float, float]] = deque(maxlen=60)

        # Activity log (last 20 entries)
        self.activity: deque[dict] = deque(maxlen=20)

        # Error state
        self.last_error: dict | None = None
        self.error_start: datetime | None = None
        self.stuck_ticks: int = 0

        # Stats
        self.tasks_completed: int = 0
        self.total_distance: float = 0.0
        self.total_error_time: float = 0.0
        self.total_charge_time: float = 0.0
        self.task_times: list[float] = []  # in seconds
        self.error_history: list[dict] = []

        # Battery drain rates (% per tick at 500ms interval)
        self.drain_rates = {
            "Amazon Normal": 0.8 / 120,      # 0.8% per minute / 120 ticks per minute
            "Balyo": 0.6 / 120,
            "Amazon Internal": 1.2 / 120,
        }

        # Charge rate (% per tick)
        self.charge_rate = 5.0 / 120  # 5% per minute

    def get_drain_rate(self) -> float:
        return self.drain_rates.get(self.vendor, 1.0 / 120)

    def add_activity(self, description: str, activity_type: str):
        self.activity.appendleft({
            "timestamp": datetime.now(),
            "description": description,
            "type": activity_type,
        })

    def to_raw_data(self) -> dict[str, Any]:
        """Convert to vendor-specific raw format for adapter processing."""
        trail_data = []
        task_data = None
        error_data = None

        if self.task:
            task_data = dict(self.task)

        if self.last_error:
            error_data = dict(self.last_error)

        activity_data = [dict(a) for a in list(self.activity)[:10]]

        if self.vendor == "Amazon Normal":
            status_code = {
                RobotStatus.IDLE: 0,
                RobotStatus.ACTIVE: 1,
                RobotStatus.ERROR: 2,
                RobotStatus.CHARGING: 3,
                RobotStatus.OFFLINE: 4,
            }.get(self.status, 0)

            trail_data = [{"x": t[0], "y": t[1]} for t in self.trail]

            return {
                "robot_id": self.robot_id,
                "position": {"x": round(self.x, 2), "y": round(self.y, 2)},
                "status_code": status_code,
                "battery": round(self.battery, 1),
                "heading": round(self.heading, 1),
                "speed": round(self.speed, 2),
                "task": task_data,
                "last_error": error_data,
                "trail": trail_data,
                "activity": activity_data,
            }

        elif self.vendor == "Balyo":
            status_str = {
                RobotStatus.IDLE: "IDLE",
                RobotStatus.ACTIVE: "OPERATIONAL",
                RobotStatus.ERROR: "FAULT",
                RobotStatus.CHARGING: "CHARGING",
                RobotStatus.OFFLINE: "OFFLINE",
            }.get(self.status, "IDLE")

            trail_data = [
                {"lat": t[0] / GRID_WIDTH, "lng": t[1] / GRID_HEIGHT}
                for t in self.trail
            ]

            return {
                "robot_id": self.robot_id,
                "position": {
                    "lat": self.x / GRID_WIDTH,
                    "lng": self.y / GRID_HEIGHT,
                },
                "status_str": status_str,
                "battery_pct": round(self.battery, 1),
                "orientation_deg": round(self.heading, 1),
                "velocity_mps": round(self.speed, 2),
                "task": task_data,
                "last_error": error_data,
                "trail": trail_data,
                "activity": activity_data,
            }

        else:  # Amazon Internal
            status_de = {
                RobotStatus.IDLE: "Bereit",
                RobotStatus.ACTIVE: "Aktiv",
                RobotStatus.ERROR: "Fehler",
                RobotStatus.CHARGING: "Laden",
                RobotStatus.OFFLINE: "Offline",
            }.get(self.status, "Bereit")

            trail_data = [[t[1], t[0]] for t in self.trail]  # [row, col] = [y, x]

            return {
                "robot_id": self.robot_id,
                "position": [round(self.y, 2), round(self.x, 2)],  # [row, col]
                "status_de": status_de,
                "batterie": round(self.battery, 1),
                "richtung": round(self.heading, 1),
                "geschwindigkeit": round(self.speed, 2),
                "task": task_data,
                "last_error": error_data,
                "trail": trail_data,
                "activity": activity_data,
            }


class FleetSimulator:
    """
    Manages the simulation of 24 robots across 3 vendors.
    Call tick() every 500ms to advance the simulation.
    """

    def __init__(self):
        self.robots: dict[str, RawRobot] = {}
        self.tick_count: int = 0
        self.task_counter: int = 0
        self._initialize_fleet()

    def _initialize_fleet(self):
        """Create 24 robots: 8 Amazon Normal, 12 Balyo, 4 Amazon Internal."""
        # Amazon Normal: 8 robots
        ar_positions = [
            (5, 5), (12, 5), (5, 10), (12, 10),
            (18, 5), (25, 5), (18, 10), (25, 10),
        ]
        for i, (x, y) in enumerate(ar_positions, 1):
            rid = f"AR-{i:03d}"
            self.robots[rid] = RawRobot(
                rid, "Amazon Normal", x, y,
                battery=random.uniform(40, 100),
            )

        # Balyo: 12 robots
        balyo_positions = [
            (3, 17), (10, 17), (17, 17), (24, 17),
            (31, 17), (37, 17), (3, 24), (10, 24),
            (17, 24), (24, 24), (31, 24), (37, 24),
        ]
        for i, (x, y) in enumerate(balyo_positions, 1):
            rid = f"BALYO-{i:03d}"
            self.robots[rid] = RawRobot(
                rid, "Balyo", x, y,
                battery=random.uniform(40, 100),
            )

        # Amazon Internal: 4 robots
        amzn_positions = [(8, 7), (20, 15), (32, 7), (20, 22)]
        for i, (x, y) in enumerate(amzn_positions, 1):
            rid = f"AMZN-{i:03d}"
            self.robots[rid] = RawRobot(
                rid, "Amazon Internal", x, y,
                battery=random.uniform(30, 90),
            )

        # Start some robots with tasks immediately
        robot_list = list(self.robots.values())
        for robot in random.sample(robot_list, min(12, len(robot_list))):
            self._assign_task(robot)

    def _next_task_id(self) -> str:
        self.task_counter += 1
        return f"T-{self.task_counter:04d}"

    def _assign_task(self, robot: RawRobot):
        """Assign a random pickup/delivery task to a robot."""
        from_name, to_name = get_random_station_pair()
        from_pos = STATIONS[from_name]
        to_pos = STATIONS[to_name]

        task_type = random.choice(["pickup", "delivery", "transport"])
        task_id = self._next_task_id()

        robot.task = {
            "task_id": task_id,
            "task_type": task_type,
            "from_station": from_name,
            "to_station": to_name,
            "status": "in_progress",
            "started_at": datetime.now(),
            "eta_seconds": None,
        }
        robot.task_destination = to_pos
        robot.task_origin = from_pos
        robot.status = RobotStatus.ACTIVE
        robot.speed = random.uniform(1.2, 2.8)  # realistic AMR speeds (m/s)
        robot.add_activity(
            f"Started task {task_id}: {task_type} from {from_name} to {to_name}",
            "task_started",
        )

    def _move_robot(self, robot: RawRobot):
        """Move robot one step toward its destination."""
        if not robot.task_destination or robot.status != RobotStatus.ACTIVE:
            return

        dest = robot.task_destination
        dx = dest.x - robot.x
        dy = dest.y - robot.y
        dist = math.sqrt(dx * dx + dy * dy)

        if dist < 1.0:
            # Arrived at destination
            self._complete_task(robot)
            return

        # Vary speed slightly each tick for realism (±15%)
        robot.speed = max(0.5, robot.speed + random.uniform(-0.15, 0.15))
        robot.speed = min(3.5, robot.speed)

        # Move one step (speed-proportional, ~1 cell at speed 2.0)
        step = min(robot.speed * 0.5, dist)  # speed * 0.5s tick
        robot.heading = math.degrees(math.atan2(dy, dx)) % 360
        old_x, old_y = robot.x, robot.y
        robot.x += (dx / dist) * step
        robot.y += (dy / dist) * step

        # Clamp to grid
        robot.x = max(0, min(GRID_WIDTH - 1, robot.x))
        robot.y = max(0, min(GRID_HEIGHT - 1, robot.y))

        # Track distance
        actual_dist = math.sqrt((robot.x - old_x) ** 2 + (robot.y - old_y) ** 2)
        robot.total_distance += actual_dist

        # Update ETA
        remaining = distance(Position(x=robot.x, y=robot.y), dest)
        robot.task["eta_seconds"] = remaining / max(robot.speed, 0.1)

    def _complete_task(self, robot: RawRobot):
        """Mark current task as completed."""
        if robot.task:
            task_id = robot.task["task_id"]
            started = robot.task["started_at"]
            duration = (datetime.now() - started).total_seconds()
            robot.task_times.append(duration)
            robot.tasks_completed += 1
            robot.add_activity(
                f"Completed task {task_id}",
                "task_completed",
            )
            robot.task = None
        robot.task_destination = None
        robot.task_origin = None
        robot.status = RobotStatus.IDLE
        robot.speed = 0.0

    def _handle_battery(self, robot: RawRobot):
        """Drain or charge battery."""
        if robot.status == RobotStatus.CHARGING:
            robot.battery = min(100.0, robot.battery + robot.charge_rate)
            robot.total_charge_time += 0.5  # 500ms
            if robot.battery >= 95.0:
                robot.add_activity("Charged to 95%", "charging_complete")
                robot.status = RobotStatus.IDLE
                robot.speed = 0.0
            return

        if robot.status in (RobotStatus.ACTIVE, RobotStatus.IDLE):
            drain = robot.get_drain_rate()
            if robot.status == RobotStatus.IDLE:
                drain *= 0.3  # Idle drains much less
            robot.battery = max(0, robot.battery - drain)

        # Auto-charge when low
        if robot.battery < 15.0 and robot.status != RobotStatus.CHARGING and robot.status != RobotStatus.ERROR:
            name, pos, dist = get_nearest_charging_station(robot.x, robot.y)
            if dist < 2.0:
                # Close enough to charging station
                robot.status = RobotStatus.CHARGING
                robot.speed = 0.0
                if robot.task:
                    robot.task["status"] = "cancelled"
                    robot.add_activity(
                        f"Cancelled task {robot.task['task_id']} — battery critical",
                        "task_cancelled",
                    )
                    robot.task = None
                robot.task_destination = None
                robot.add_activity(f"Docked at {name} for charging ({robot.battery:.0f}%)", "charging_start")
            else:
                # Navigate to charger
                if robot.task:
                    robot.task["status"] = "cancelled"
                    robot.add_activity(
                        f"Cancelled task {robot.task['task_id']} — navigating to charger",
                        "task_cancelled",
                    )
                robot.task = {
                    "task_id": self._next_task_id(),
                    "task_type": "charging",
                    "from_station": get_zone_for_position(robot.x, robot.y),
                    "to_station": name,
                    "status": "in_progress",
                    "started_at": datetime.now(),
                    "eta_seconds": dist / 1.0,
                }
                robot.task_destination = pos
                robot.status = RobotStatus.ACTIVE
                robot.speed = 1.0

    def _maybe_generate_error(self, robot: RawRobot):
        """Randomly generate errors (low probability per tick)."""
        if robot.status in (RobotStatus.ERROR, RobotStatus.CHARGING, RobotStatus.OFFLINE):
            return

        # Error probability: ~1 error per 5 minutes per robot on average
        # 5 min = 600 ticks => prob = 1/600 ≈ 0.0017
        # Amazon Internal units have higher error rate
        error_prob = 0.0017
        if robot.vendor == "Amazon Internal":
            error_prob = 0.005  # ~3x higher

        if random.random() > error_prob:
            return

        # Pick a random error for this vendor
        if robot.vendor == "Amazon Normal":
            error_pool = [e for e in AR_ERRORS if e.severity.value != "info"]
        elif robot.vendor == "Balyo":
            error_pool = [e for e in BALYO_ERRORS if e.severity.value != "info"]
        else:
            error_pool = [e for e in AMZN_ERRORS if e.severity.value != "info"]

        error = random.choice(error_pool)

        robot.status = RobotStatus.ERROR
        robot.speed = 0.0
        robot.error_start = datetime.now()
        robot.last_error = {
            "error_code": error.code,
            "name": error.name,
            "description": error.description,
            "timestamp": datetime.now(),
            "resolved": False,
        }
        robot.error_history.append({
            "error_code": error.code,
            "name": error.name,
            "timestamp": datetime.now(),
            "position": {"x": robot.x, "y": robot.y},
            "zone": get_zone_for_position(robot.x, robot.y),
        })
        robot.add_activity(
            f"Error: {error.code} — {error.name}",
            "error",
        )

    def _maybe_resolve_error(self, robot: RawRobot):
        """Auto-resolve some errors after a delay."""
        if robot.status != RobotStatus.ERROR or not robot.error_start:
            return

        elapsed = (datetime.now() - robot.error_start).total_seconds()
        robot.total_error_time += 0.5

        # Auto-resolve after 10-60 seconds (random)
        if elapsed > random.uniform(10, 60):
            robot.status = RobotStatus.IDLE
            robot.speed = 0.0
            if robot.last_error:
                robot.last_error["resolved"] = True
            robot.error_start = None
            robot.add_activity("Error resolved — resuming operations", "error_resolved")

    def tick(self):
        """Advance simulation by one tick (500ms)."""
        self.tick_count += 1

        for robot in self.robots.values():
            # Record trail
            robot.trail.append((robot.x, robot.y))

            # Handle different states
            if robot.status == RobotStatus.ERROR:
                self._maybe_resolve_error(robot)
                continue

            if robot.status == RobotStatus.OFFLINE:
                continue

            # Battery management
            self._handle_battery(robot)

            if robot.status == RobotStatus.CHARGING:
                continue

            # Movement
            if robot.status == RobotStatus.ACTIVE:
                self._move_robot(robot)

            # Assign tasks to idle robots (with some delay)
            if robot.status == RobotStatus.IDLE and random.random() < 0.05:
                self._assign_task(robot)

            # Random errors
            self._maybe_generate_error(robot)

    def get_all_unified(self) -> list[UnifiedRobotState]:
        """Get all robots as unified state objects."""
        result = []
        for robot in self.robots.values():
            adapter = get_adapter(robot.vendor)
            raw_data = robot.to_raw_data()
            unified = adapter.normalize(raw_data)
            result.append(unified)
        return result

    def get_robot_unified(self, robot_id: str) -> UnifiedRobotState | None:
        """Get a single robot's unified state."""
        robot = self.robots.get(robot_id)
        if not robot:
            return None
        adapter = get_adapter(robot.vendor)
        return adapter.normalize(robot.to_raw_data())

    def get_raw_robot(self, robot_id: str) -> RawRobot | None:
        """Get the internal raw robot state."""
        return self.robots.get(robot_id)

    def command_robot(self, robot_id: str, command: str, **kwargs) -> dict:
        """Execute a command on a robot. Returns dict with success and extra info."""
        robot = self.robots.get(robot_id)
        if not robot:
            return {"success": False, "message": "Robot not found"}

        if command == "pause":
            if robot.status == RobotStatus.ACTIVE:
                robot.status = RobotStatus.IDLE
                robot.speed = 0.0
                robot.add_activity("Paused by operator", "command")
                return {"success": True}
            return {"success": False, "message": "Robot is not active"}

        elif command == "resume":
            if robot.status == RobotStatus.IDLE and robot.task_destination:
                robot.status = RobotStatus.ACTIVE
                robot.speed = random.uniform(1.2, 2.8)
                robot.add_activity("Resumed by operator", "command")
                return {"success": True}
            return {"success": False, "message": "Robot has no destination to resume to"}

        elif command == "send_to_charging":
            name, pos, dist = get_nearest_charging_station(robot.x, robot.y)
            if robot.task:
                robot.task["status"] = "cancelled"
                robot.add_activity(f"Task cancelled — sent to charging", "command")
            robot.task = {
                "task_id": self._next_task_id(),
                "task_type": "charging",
                "from_station": get_zone_for_position(robot.x, robot.y),
                "to_station": name,
                "status": "in_progress",
                "started_at": datetime.now(),
                "eta_seconds": dist / 1.0,
            }
            robot.task_destination = pos
            robot.status = RobotStatus.ACTIVE
            robot.speed = 1.5
            robot.add_activity(f"Sent to {name} for charging", "command")
            return {
                "success": True,
                "charging_target": {"name": name, "x": pos.x, "y": pos.y},
                "robot_position": {"x": robot.x, "y": robot.y},
            }

        elif command == "assign_task":
            from_station = kwargs.get("from_station")
            to_station = kwargs.get("to_station")
            task_type = kwargs.get("task_type", "transport")
            catalog_task_id = kwargs.get("catalog_task_id")  # e.g. "move_pod"

            # Look up catalog task for speed range
            cat = CATALOG_BY_ID.get(catalog_task_id) if catalog_task_id else None
            task_label = cat.name if cat else task_type  # display name

            # Auto-pick stations if not provided
            if not from_station or from_station not in STATIONS:
                from_station, _ = get_task_stations(catalog_task_id or "")
            if not to_station or to_station not in STATIONS:
                _, to_station = get_task_stations(catalog_task_id or "")
            # Ensure they're different
            if from_station == to_station:
                all_names = [n for n in STATIONS if n != from_station]
                to_station = random.choice(all_names)

            from_pos = STATIONS[from_station]
            to_pos = STATIONS[to_station]
            task_id = self._next_task_id()

            speed_lo, speed_hi = (cat.speed_range if cat else (1.2, 2.8))

            robot.task = {
                "task_id": task_id,
                "task_type": task_label,
                "from_station": from_station,
                "to_station": to_station,
                "status": "in_progress",
                "started_at": datetime.now(),
                "eta_seconds": None,
                "catalog_task_id": catalog_task_id,
            }
            robot.task_destination = to_pos
            robot.task_origin = from_pos
            robot.status = RobotStatus.ACTIVE
            robot.speed = random.uniform(speed_lo, speed_hi)
            robot.add_activity(
                f"Started {task_label} ({task_id}): {from_station} → {to_station}",
                "task_started",
            )
            return {
                "success": True,
                "task_id": task_id,
                "task_name": task_label,
                "from_station": from_station,
                "to_station": to_station,
                "destination": {"x": to_pos.x, "y": to_pos.y},
            }

        elif command == "clear_error":
            if robot.status == RobotStatus.ERROR:
                robot.status = RobotStatus.IDLE
                robot.speed = 0.0
                if robot.last_error:
                    robot.last_error["resolved"] = True
                robot.error_start = None
                robot.add_activity("Error cleared by operator", "command")
                return {"success": True}
            return {"success": False, "message": "Robot has no active error"}

        return {"success": False, "message": f"Unknown command: {command}"}

    def get_fleet_summary(self) -> dict:
        """Get a text summary of the fleet for LLM context."""
        robots = self.get_all_unified()
        active = sum(1 for r in robots if r.status == RobotStatus.ACTIVE)
        idle = sum(1 for r in robots if r.status == RobotStatus.IDLE)
        error = sum(1 for r in robots if r.status == RobotStatus.ERROR)
        charging = sum(1 for r in robots if r.status == RobotStatus.CHARGING)
        offline = sum(1 for r in robots if r.status == RobotStatus.OFFLINE)

        return {
            "total_robots": len(robots),
            "active": active,
            "idle": idle,
            "error": error,
            "charging": charging,
            "offline": offline,
            "vendors": {
                "Amazon Normal": sum(1 for r in robots if r.vendor == "Amazon Normal"),
                "Balyo": sum(1 for r in robots if r.vendor == "Balyo"),
                "Amazon Internal": sum(1 for r in robots if r.vendor == "Amazon Internal"),
            },
        }

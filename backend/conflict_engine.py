"""
Conflict Detection Engine for FleetBridge.
Continuously monitors robot positions and states to detect:
1. Deadlocks (mutual blocking)
2. Collision courses (projected trajectory intersections)
3. Congestion (zone overcrowding)
4. Battery critical (insufficient to complete task + reach charger)
5. Path blocked (robot stopped by another robot)
"""

from __future__ import annotations

import math
from datetime import datetime
from typing import Optional

from models import (
    Alert,
    AlertSeverity,
    AlertType,
    Position,
    RobotStatus,
    UnifiedRobotState,
)
from facility import (
    ZONES,
    CHARGING_STATIONS,
    get_nearest_charging_station,
    distance,
)
from simulator import FleetSimulator


class ConflictEngine:
    """Detects fleet conflicts and generates alerts."""

    MAX_ACTIVE_ALERTS = 8          # hard cap on visible alerts
    COOLDOWN_SECONDS = 120          # 2 min between duplicate alerts
    STALE_SECONDS = 90              # auto-resolve after 90s if condition gone
    RESOLVED_TTL_SECONDS = 30       # remove resolved alerts after 30s

    def __init__(self, simulator: FleetSimulator):
        self.simulator = simulator
        self.active_alerts: dict[str, Alert] = {}  # key = alert fingerprint
        self._alert_cooldowns: dict[str, datetime] = {}  # prevent spam

    def check_all(self) -> list[Alert]:
        """Run all conflict checks. Returns new alerts generated."""
        robots = self.simulator.get_all_unified()
        new_alerts: list[Alert] = []

        new_alerts.extend(self._check_robot_errors(robots))
        new_alerts.extend(self._check_deadlocks(robots))
        new_alerts.extend(self._check_collision_courses(robots))
        new_alerts.extend(self._check_congestion(robots))
        new_alerts.extend(self._check_battery_critical(robots))
        new_alerts.extend(self._check_path_blocked(robots))

        # Collect fingerprints of conditions that are STILL true this tick
        current_fps = set()
        for alert in new_alerts:
            fp = self._fingerprint(alert)
            current_fps.add(fp)

        # Add genuinely new alerts (respect cooldown + cap)
        for alert in new_alerts:
            fp = self._fingerprint(alert)
            if fp not in self.active_alerts and not self._is_on_cooldown(fp):
                # Drop oldest non-critical if at capacity
                if len([a for a in self.active_alerts.values() if not a.resolved]) >= self.MAX_ACTIVE_ALERTS:
                    self._evict_oldest()
                self.active_alerts[fp] = alert
                self._alert_cooldowns[fp] = datetime.now()

        # Auto-resolve alerts whose condition is no longer detected
        self._auto_resolve_stale(current_fps)

        # Remove resolved alerts quickly
        self._cleanup_old_alerts()

        return new_alerts

    def get_active_alerts(self) -> list[Alert]:
        """Get only UNRESOLVED alerts, sorted by severity then time. Max 8."""
        alerts = [a for a in self.active_alerts.values() if not a.resolved]
        severity_order = {
            AlertSeverity.CRITICAL: 0,
            AlertSeverity.WARNING: 1,
            AlertSeverity.INFO: 2,
            AlertSeverity.RESOLVED: 3,
        }
        alerts.sort(key=lambda a: (severity_order.get(a.severity, 9), a.created_at))
        return alerts[:self.MAX_ACTIVE_ALERTS]

    def acknowledge_alert(self, alert_id: str) -> bool:
        for alert in self.active_alerts.values():
            if alert.id == alert_id:
                alert.acknowledged = True
                alert.acknowledged_at = datetime.now()
                return True
        return False

    def resolve_alert(self, alert_id: str) -> bool:
        for fp, alert in list(self.active_alerts.items()):
            if alert.id == alert_id:
                alert.resolved = True
                alert.resolved_at = datetime.now()
                alert.severity = AlertSeverity.RESOLVED
                return True
        return False

    def _fingerprint(self, alert: Alert) -> str:
        """Generate a unique fingerprint for deduplication."""
        robots_key = "-".join(sorted(alert.affected_robots))
        return f"{alert.alert_type.value}:{robots_key}"

    def _is_on_cooldown(self, fingerprint: str) -> bool:
        """Check if a similar alert was recently generated."""
        last_time = self._alert_cooldowns.get(fingerprint)
        if not last_time:
            return False
        return (datetime.now() - last_time).total_seconds() < self.COOLDOWN_SECONDS

    def _auto_resolve_stale(self, current_fps: set[str]):
        """Auto-resolve alerts whose condition is no longer detected."""
        now = datetime.now()
        for fp, alert in list(self.active_alerts.items()):
            if alert.resolved:
                continue
            # If the condition is no longer present and alert is old enough
            if fp not in current_fps:
                age = (now - alert.created_at).total_seconds()
                if age > self.STALE_SECONDS:
                    alert.resolved = True
                    alert.resolved_at = now
                    alert.severity = AlertSeverity.RESOLVED

    def _evict_oldest(self):
        """Remove the oldest non-critical resolved or warning alert to make room."""
        # First try to remove resolved ones
        resolved = [(fp, a) for fp, a in self.active_alerts.items() if a.resolved]
        if resolved:
            oldest_fp = min(resolved, key=lambda x: x[1].created_at)[0]
            del self.active_alerts[oldest_fp]
            return
        # Then evict oldest warning/info
        non_critical = [(fp, a) for fp, a in self.active_alerts.items()
                        if a.severity not in (AlertSeverity.CRITICAL,)]
        if non_critical:
            oldest_fp = min(non_critical, key=lambda x: x[1].created_at)[0]
            del self.active_alerts[oldest_fp]

    def _cleanup_old_alerts(self):
        """Remove resolved alerts quickly."""
        now = datetime.now()
        to_remove = []
        for fp, alert in self.active_alerts.items():
            if alert.resolved and alert.resolved_at:
                if (now - alert.resolved_at).total_seconds() > self.RESOLVED_TTL_SECONDS:
                    to_remove.append(fp)
        for fp in to_remove:
            del self.active_alerts[fp]

    # --- Detection Algorithms ---

    def _check_robot_errors(self, robots: list[UnifiedRobotState]) -> list[Alert]:
        """Generate CRITICAL alerts for any robot currently in ERROR state.
        This ensures the Critical count matches the Error count in the legend."""
        alerts = []
        for robot in robots:
            if robot.status != RobotStatus.ERROR:
                continue
            err_code = robot.last_error.error_code if robot.last_error else "UNKNOWN"
            err_name = robot.last_error.name if robot.last_error else "Unknown error"
            alerts.append(Alert(
                alert_type=AlertType.ERROR,
                severity=AlertSeverity.CRITICAL,
                title=f"Error: {robot.id} — {err_name}",
                description=(
                    f"{robot.id} ({robot.vendor}) is in ERROR state with code "
                    f"{err_code} ({err_name}). "
                    f"Battery: {robot.battery:.0f}%, Zone: {robot.zone}. "
                    f"Robot has been stopped and needs attention."
                ),
                affected_robots=[robot.id],
                suggested_action=(
                    f"Clear the error on {robot.id} or send a technician to "
                    f"position ({robot.position.x:.0f}, {robot.position.y:.0f}) in {robot.zone}. "
                    f"If auto-recoverable, try clearing the error via dashboard."
                ),
                position=robot.position,
            ))
        return alerts

    def _check_deadlocks(self, robots: list[UnifiedRobotState]) -> list[Alert]:
        """Detect mutual blocking between stationary robots."""
        alerts = []
        idle_or_error = [
            r for r in robots
            if r.status in (RobotStatus.IDLE, RobotStatus.ERROR)
            and r.current_task is not None
        ]

        checked = set()
        for r1 in idle_or_error:
            for r2 in idle_or_error:
                if r1.id == r2.id:
                    continue
                pair = tuple(sorted([r1.id, r2.id]))
                if pair in checked:
                    continue
                checked.add(pair)

                dist_r1_r2 = distance(r1.position, r2.position)
                if dist_r1_r2 > 5:
                    continue

                # Check if they might be blocking each other
                # (both stationary, close together, both have active tasks)
                if r1.current_task and r2.current_task:
                    alerts.append(Alert(
                        alert_type=AlertType.DEADLOCK,
                        severity=AlertSeverity.CRITICAL,
                        title=f"Deadlock: {r1.id} and {r2.id}",
                        description=(
                            f"{r1.id} ({r1.vendor}) and {r2.id} ({r2.vendor}) "
                            f"are blocking each other near position "
                            f"({r1.position.x:.0f}, {r1.position.y:.0f}). "
                            f"Neither robot can proceed to their destination."
                        ),
                        affected_robots=[r1.id, r2.id],
                        suggested_action=(
                            f"Override {r2.id} to reverse 3 meters, then let {r1.id} proceed. "
                            f"Alternatively, cancel one robot's task and send it to parking."
                        ),
                        position=r1.position,
                    ))
        return alerts

    def _check_collision_courses(self, robots: list[UnifiedRobotState]) -> list[Alert]:
        """Project trajectories forward and detect potential collisions."""
        alerts = []
        active_robots = [r for r in robots if r.status == RobotStatus.ACTIVE and r.speed > 0]

        for i, r1 in enumerate(active_robots):
            for r2 in active_robots[i + 1:]:
                # Only check if already somewhat close
                if distance(r1.position, r2.position) > 15:
                    continue
                # Project positions forward (5-second intervals, up to 20 seconds)
                for t in range(5, 25, 5):
                    heading1_rad = math.radians(r1.heading)
                    heading2_rad = math.radians(r2.heading)

                    proj1_x = r1.position.x + math.cos(heading1_rad) * r1.speed * t
                    proj1_y = r1.position.y + math.sin(heading1_rad) * r1.speed * t
                    proj2_x = r2.position.x + math.cos(heading2_rad) * r2.speed * t
                    proj2_y = r2.position.y + math.sin(heading2_rad) * r2.speed * t

                    projected_dist = math.sqrt(
                        (proj1_x - proj2_x) ** 2 + (proj1_y - proj2_y) ** 2
                    )

                    if projected_dist < 2.0:
                        alerts.append(Alert(
                            alert_type=AlertType.COLLISION_COURSE,
                            severity=AlertSeverity.WARNING,
                            title=f"Potential collision: {r1.id} and {r2.id}",
                            description=(
                                f"{r1.id} and {r2.id} are on a collision course. "
                                f"Estimated intersection in ~{t} seconds near "
                                f"({proj1_x:.0f}, {proj1_y:.0f})."
                            ),
                            affected_robots=[r1.id, r2.id],
                            suggested_action=(
                                f"Pause {r2.id} for {t} seconds to let {r1.id} "
                                f"clear the intersection."
                            ),
                            position=Position(x=proj1_x, y=proj1_y),
                        ))
                        break  # One alert per pair
        return alerts

    def _check_congestion(self, robots: list[UnifiedRobotState]) -> list[Alert]:
        """Detect zones with too many robots."""
        alerts = []
        zone_robots: dict[str, list[str]] = {}

        for robot in robots:
            if robot.status != RobotStatus.OFFLINE:
                zone = robot.zone
                if zone not in zone_robots:
                    zone_robots[zone] = []
                zone_robots[zone].append(robot.id)

        for zone_name, robot_ids in zone_robots.items():
            if len(robot_ids) >= 8:  # Threshold for congestion (relaxed for 24 robots in 6 zones)
                alerts.append(Alert(
                    alert_type=AlertType.CONGESTION,
                    severity=AlertSeverity.WARNING,
                    title=f"Congestion in {zone_name}",
                    description=(
                        f"{zone_name} has {len(robot_ids)} robots, which exceeds "
                        f"the comfortable capacity. Robots: {', '.join(robot_ids[:5])}"
                        f"{'...' if len(robot_ids) > 5 else ''}. "
                        f"Expected wait times may increase."
                    ),
                    affected_robots=robot_ids,
                    suggested_action=(
                        f"Reroute 2-3 robots to adjacent zones to reduce density. "
                        f"Consider redistributing tasks across zones."
                    ),
                ))
        return alerts

    def _check_battery_critical(self, robots: list[UnifiedRobotState]) -> list[Alert]:
        """Detect robots that may not complete their task + reach a charger."""
        alerts = []
        drain_rates = {
            "Amazon Normal": 0.8,     # % per minute
            "Balyo": 0.6,
            "Amazon Internal": 1.2,
        }

        for robot in robots:
            if robot.status in (RobotStatus.CHARGING, RobotStatus.OFFLINE):
                continue
            if robot.battery > 25:
                continue

            drain = drain_rates.get(robot.vendor, 1.0)
            _, charger_pos, charger_dist = get_nearest_charging_station(
                robot.position.x, robot.position.y
            )

            # Estimate time to reach charger (assuming speed ~1 m/s)
            charger_time_min = charger_dist / 1.0 / 60.0
            battery_needed_for_charger = charger_time_min * drain

            # Estimate task remaining time
            task_battery_needed = 0
            if robot.current_task and robot.current_task.eta_seconds:
                task_time_min = robot.current_task.eta_seconds / 60.0
                task_battery_needed = task_time_min * drain

            total_needed = task_battery_needed + battery_needed_for_charger + 5  # 5% buffer

            if robot.battery < total_needed:
                severity = AlertSeverity.CRITICAL if robot.battery < 10 else AlertSeverity.WARNING
                alerts.append(Alert(
                    alert_type=AlertType.BATTERY_CRITICAL,
                    severity=severity,
                    title=f"Battery critical: {robot.id} ({robot.battery:.0f}%)",
                    description=(
                        f"{robot.id} ({robot.vendor}) has {robot.battery:.0f}% battery. "
                        f"At current drain rate ({drain}%/min), it may not complete its "
                        f"current task and reach a charging station. "
                        f"Nearest charger is {charger_dist:.0f}m away."
                    ),
                    affected_robots=[robot.id],
                    suggested_action=(
                        f"Send {robot.id} directly to charging station "
                        f"({charger_dist:.0f}m away). "
                        f"{'Abort current task first.' if robot.current_task else ''}"
                    ),
                    position=robot.position,
                ))
        return alerts

    def _check_path_blocked(self, robots: list[UnifiedRobotState]) -> list[Alert]:
        """Detect robots stuck due to another robot blocking their path."""
        alerts = []
        error_robots = [r for r in robots if r.status == RobotStatus.ERROR]
        all_positions = {r.id: r.position for r in robots}

        for robot in error_robots:
            if not robot.last_error:
                continue

            # Check if another robot is very close (potential blocker)
            for other in robots:
                if other.id == robot.id:
                    continue
                dist = distance(robot.position, other.position)
                if dist < 3.0 and other.status in (RobotStatus.IDLE, RobotStatus.ERROR):
                    alerts.append(Alert(
                        alert_type=AlertType.PATH_BLOCKED,
                        severity=AlertSeverity.WARNING,
                        title=f"Path blocked: {robot.id} by {other.id}",
                        description=(
                            f"{robot.id} ({robot.vendor}) cannot proceed — "
                            f"path appears blocked by {other.id} ({other.vendor}) "
                            f"at position ({other.position.x:.0f}, {other.position.y:.0f}). "
                            f"{other.id} has been {'idle' if other.status == RobotStatus.IDLE else 'in error state'}."
                        ),
                        affected_robots=[robot.id, other.id],
                        suggested_action=(
                            f"Move {other.id} out of the way — assign it a new task "
                            f"or send it to a parking zone. {robot.id} should resume automatically."
                        ),
                        position=robot.position,
                    ))
                    break  # One alert per blocked robot

        return alerts

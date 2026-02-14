"""
Analytics Engine for FleetBridge.
Aggregates fleet data for dashboard views:
- Daily Summary (KPIs, tasks by hour, top errors)
- Vendor Comparison
- Robot Performance
- Zone Analysis
"""

from __future__ import annotations

from datetime import datetime
from collections import Counter

from models import (
    DailySummary,
    VendorMetrics,
    RobotPerformance,
    ZoneMetrics,
    RobotStatus,
)
from simulator import FleetSimulator
from facility import ZONES, get_zone_for_position


class AnalyticsEngine:
    """Computes fleet analytics from simulator state."""

    def __init__(self, simulator: FleetSimulator):
        self.simulator = simulator

    def get_daily_summary(self) -> DailySummary:
        """Compute today's fleet-wide KPIs."""
        robots = self.simulator.robots.values()

        total_tasks = sum(r.tasks_completed for r in robots)
        total_distance = sum(r.total_distance for r in robots)
        total_distance_km = total_distance * 0.025  # grid units to km (approx)

        all_task_times = []
        for r in robots:
            all_task_times.extend(r.task_times)
        avg_task_time = (sum(all_task_times) / len(all_task_times) / 60.0) if all_task_times else 0.0

        # Uptime: total time - error time - charge time (simplified)
        total_time = self.simulator.tick_count * 0.5  # seconds
        total_error_time = sum(r.total_error_time for r in robots)
        total_charge_time = sum(r.total_charge_time for r in robots)
        total_robot_time = total_time * len(list(robots)) if total_time > 0 else 1
        uptime = max(0, (total_robot_time - total_error_time - total_charge_time) / total_robot_time * 100)

        # Tasks by hour (simulated distribution)
        tasks_by_hour: dict[int, int] = {}
        now_hour = datetime.now().hour
        for h in range(24):
            if h <= now_hour:
                # Distribute tasks roughly by hour
                base = max(0, total_tasks // max(1, now_hour + 1))
                tasks_by_hour[h] = base + (h % 3)  # slight variation
            else:
                tasks_by_hour[h] = 0

        # Top errors
        error_counter: Counter = Counter()
        for r in robots:
            for err in r.error_history:
                error_counter[f"{err['error_code']}|{err['name']}"] += 1

        top_errors = [
            {"code": key.split("|")[0], "name": key.split("|")[1], "count": count}
            for key, count in error_counter.most_common(5)
        ]

        return DailySummary(
            total_tasks=total_tasks,
            total_distance_km=round(total_distance_km, 1),
            avg_task_time_min=round(avg_task_time, 1),
            uptime_percent=round(uptime, 1),
            tasks_by_hour=tasks_by_hour,
            top_errors=top_errors,
            tasks_change_percent=round(12.3, 1),  # simulated trend
            distance_change_percent=round(8.1, 1),
            time_change_min=round(-0.3, 1),
            uptime_change_percent=round(1.2, 1),
        )

    def get_vendor_comparison(self) -> list[VendorMetrics]:
        """Compare performance metrics across vendors."""
        vendor_groups: dict[str, list] = {
            "Amazon": [],
            "Balyo": [],
            "Gemini": [],
        }

        for r in self.simulator.robots.values():
            vendor_groups[r.vendor].append(r)

        results = []
        for vendor, robots in vendor_groups.items():
            if not robots:
                continue

            robot_count = len(robots)
            total_tasks = sum(r.tasks_completed for r in robots)
            tasks_per_robot = total_tasks / robot_count if robot_count > 0 else 0

            all_times = []
            for r in robots:
                all_times.extend(r.task_times)
            avg_task_time = (sum(all_times) / len(all_times) / 60.0) if all_times else 0.0

            total_errors = sum(len(r.error_history) for r in robots)
            error_rate = (total_errors / total_tasks * 100) if total_tasks > 0 else 0.0

            total_time = self.simulator.tick_count * 0.5
            total_error_time = sum(r.total_error_time for r in robots)
            total_charge_time = sum(r.total_charge_time for r in robots)
            total_robot_time = total_time * robot_count if total_time > 0 else 1
            uptime = max(0, (total_robot_time - total_error_time - total_charge_time) / total_robot_time * 100)

            avg_battery = sum(r.battery for r in robots) / robot_count if robot_count > 0 else 0

            results.append(VendorMetrics(
                vendor=vendor,
                robot_count=robot_count,
                total_tasks=total_tasks,
                tasks_per_robot=round(tasks_per_robot, 1),
                avg_task_time_min=round(avg_task_time, 1),
                total_errors=total_errors,
                error_rate_percent=round(error_rate, 1),
                uptime_percent=round(uptime, 1),
                avg_battery=round(avg_battery, 0),
            ))

        return results

    def get_robot_performance(self) -> list[RobotPerformance]:
        """Get per-robot performance table."""
        results = []
        robots = list(self.simulator.robots.values())

        # Find top performer and worst performer thresholds
        task_counts = [r.tasks_completed for r in robots]
        max_tasks = max(task_counts) if task_counts else 0
        error_counts = [len(r.error_history) for r in robots]

        for r in robots:
            all_times = r.task_times
            avg_time = (sum(all_times) / len(all_times) / 60.0) if all_times else 0.0

            total_time = self.simulator.tick_count * 0.5
            uptime = max(0, (total_time - r.total_error_time - r.total_charge_time) / max(total_time, 1) * 100)

            err_count = len(r.error_history)

            results.append(RobotPerformance(
                robot_id=r.robot_id,
                vendor=r.vendor,
                tasks_completed=r.tasks_completed,
                avg_task_time_min=round(avg_time, 1),
                error_count=err_count,
                uptime_percent=round(uptime, 1),
                is_top_performer=(r.tasks_completed >= max_tasks * 0.9 and max_tasks > 0),
                needs_attention=(err_count >= 3 or uptime < 90),
            ))

        # Sort by tasks completed descending
        results.sort(key=lambda x: x.tasks_completed, reverse=True)
        return results

    def get_zone_analysis(self) -> list[ZoneMetrics]:
        """Get per-zone activity metrics."""
        results = []
        robots = list(self.simulator.robots.values())

        for zone_name, bounds in ZONES.items():
            # Count robots currently in this zone
            zone_robots = [
                r for r in robots
                if bounds["x_min"] <= r.x <= bounds["x_max"]
                and bounds["y_min"] <= r.y <= bounds["y_max"]
            ]

            # Count tasks and errors that occurred in this zone (from error history)
            zone_errors = 0
            for r in robots:
                for err in r.error_history:
                    pos = err.get("position", {})
                    if (bounds["x_min"] <= pos.get("x", -1) <= bounds["x_max"]
                            and bounds["y_min"] <= pos.get("y", -1) <= bounds["y_max"]):
                        zone_errors += 1

            # Simulated task count based on robot presence
            task_count = sum(r.tasks_completed for r in zone_robots)

            # Activity level
            robot_count = len(zone_robots)
            if robot_count >= 6:
                activity = "very_high"
            elif robot_count >= 4:
                activity = "high"
            elif robot_count >= 2:
                activity = "medium"
            else:
                activity = "low"

            # Simulated avg wait time based on congestion
            avg_wait = 0.5 + (robot_count * 0.4)

            results.append(ZoneMetrics(
                zone=zone_name,
                task_count=task_count,
                error_count=zone_errors,
                avg_wait_time_min=round(avg_wait, 1),
                robot_count=robot_count,
                activity_level=activity,
            ))

        return results

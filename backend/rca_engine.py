"""
Root Cause Analysis Engine for FleetBridge.
When a robot enters an error state, automatically investigates the cause
by analyzing surrounding robots, error history, and documentation.
Uses Gemini for intelligent analysis when available, falls back to rule-based.
"""

from __future__ import annotations

import json
import os
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
from simulator import FleetSimulator, RawRobot
from error_kb import lookup_error, get_equivalent_errors
from facility import get_zone_for_position, distance, get_nearest_charging_station


class RCAEngine:
    """Performs root cause analysis on robot errors."""

    def __init__(self, simulator: FleetSimulator):
        self.simulator = simulator
        self._analyzed: set[str] = set()  # track analyzed error instances

    async def analyze_error(self, robot_id: str) -> Optional[str]:
        """
        Analyze why a robot is in an error state.
        Returns a plain-English analysis string.
        """
        raw_robot = self.simulator.get_raw_robot(robot_id)
        if not raw_robot or raw_robot.status != RobotStatus.ERROR:
            return None

        # Prevent re-analyzing the same error instance
        error_key = f"{robot_id}:{raw_robot.last_error.get('timestamp', '') if raw_robot.last_error else ''}"
        if error_key in self._analyzed:
            return None
        self._analyzed.add(error_key)

        # Gather context
        context = self._gather_context(raw_robot)

        # Try Gemini first
        try:
            analysis = await self._gemini_analysis(context)
        except Exception:
            analysis = self._rule_based_analysis(context)

        return analysis

    def _gather_context(self, robot: RawRobot) -> dict:
        """Collect all data needed for analysis."""
        all_robots = self.simulator.get_all_unified()
        robot_pos = Position(x=robot.x, y=robot.y)

        # Find nearby robots (within 15 units)
        nearby = []
        for r in all_robots:
            if r.id == robot.robot_id:
                continue
            dist = distance(robot_pos, r.position)
            if dist <= 15:
                nearby.append({
                    "id": r.id,
                    "vendor": r.vendor,
                    "position": f"({r.position.x:.1f}, {r.position.y:.1f})",
                    "status": r.status.value,
                    "distance": round(dist, 1),
                    "task": r.current_task.task_id if r.current_task else "None",
                    "idle_or_error": r.status in (RobotStatus.IDLE, RobotStatus.ERROR),
                })

        # Error documentation
        error_doc = None
        if robot.last_error:
            entry = lookup_error(robot.last_error.get("error_code", ""))
            if entry:
                error_doc = {
                    "code": entry.code,
                    "name": entry.name,
                    "description": entry.description,
                    "common_causes": entry.common_causes,
                    "remediation_steps": entry.remediation_steps,
                    "severity": entry.severity.value,
                    "auto_recoverable": entry.auto_recoverable,
                }

        # Historical data
        same_location_errors = []
        same_robot_errors = []
        zone = get_zone_for_position(robot.x, robot.y)

        for r in self.simulator.robots.values():
            for err in r.error_history:
                err_pos = err.get("position", {})
                if (abs(err_pos.get("x", -999) - robot.x) < 3
                        and abs(err_pos.get("y", -999) - robot.y) < 3):
                    same_location_errors.append({
                        "robot": r.robot_id,
                        "error_code": err["error_code"],
                        "timestamp": str(err["timestamp"]),
                    })
                if r.robot_id == robot.robot_id:
                    same_robot_errors.append({
                        "error_code": err["error_code"],
                        "name": err["name"],
                        "timestamp": str(err["timestamp"]),
                    })

        # Nearest charger info
        charger_name, charger_pos, charger_dist = get_nearest_charging_station(robot.x, robot.y)

        return {
            "robot_id": robot.robot_id,
            "vendor": robot.vendor,
            "position": f"({robot.x:.1f}, {robot.y:.1f})",
            "zone": zone,
            "battery": round(robot.battery, 1),
            "error": robot.last_error,
            "error_doc": error_doc,
            "task": robot.task,
            "nearby_robots": nearby,
            "same_location_errors": same_location_errors[-5:],  # last 5
            "same_robot_errors": same_robot_errors[-5:],
            "nearest_charger": {"name": charger_name, "distance": round(charger_dist, 1)},
            "total_trail_points": len(robot.trail),
        }

    async def _gemini_analysis(self, context: dict) -> str:
        """Use Gemini to generate root cause analysis."""
        import google.generativeai as genai

        api_key = os.getenv("GEMINI_API_KEY", "")
        if not api_key:
            raise ValueError("GEMINI_API_KEY not set")

        genai.configure(api_key=api_key)
        model = genai.GenerativeModel("gemini-2.0-flash")

        prompt = f"""You are analyzing a robot fleet error. Provide a concise root cause analysis.

AFFECTED ROBOT:
- ID: {context['robot_id']}
- Vendor: {context['vendor']}
- Position: {context['position']} in {context['zone']}
- Battery: {context['battery']}%
- Error: {json.dumps(context['error'], default=str)}
- Current Task: {json.dumps(context['task'], default=str)}

ERROR DOCUMENTATION:
{json.dumps(context['error_doc'], indent=2) if context['error_doc'] else 'Not available'}

NEARBY ROBOTS (within 15m):
{json.dumps(context['nearby_robots'], indent=2)}

HISTORICAL DATA:
- Errors at this location: {json.dumps(context['same_location_errors'], default=str)}
- This robot's error history: {json.dumps(context['same_robot_errors'], default=str)}
- Nearest charger: {context['nearest_charger']['name']} ({context['nearest_charger']['distance']}m away)

Provide analysis in this exact format:

WHAT HAPPENED:
[1-2 sentences describing the event]

WHY:
[Root cause explanation with evidence from the data]

SUGGESTED FIX:
1. [Step 1]
2. [Step 2]
3. [Step 3]

PATTERN WARNING (if applicable):
[Any recurring patterns detected, or "No recurring patterns detected."]"""

        response = await model.generate_content_async(prompt)
        return response.text

    def _rule_based_analysis(self, context: dict) -> str:
        """Generate analysis using rule-based logic (fallback)."""
        lines = []
        error = context.get("error", {})
        error_code = error.get("error_code", "Unknown") if error else "Unknown"
        error_name = error.get("name", "Unknown Error") if error else "Unknown Error"
        nearby = context.get("nearby_robots", [])
        battery = context.get("battery", 0)

        lines.append(f"**WHAT HAPPENED:**")
        lines.append(
            f"{context['robot_id']} ({context['vendor']}) stopped at position "
            f"{context['position']} in {context['zone']} with error {error_code} ({error_name})."
        )

        # Determine root cause
        lines.append(f"\n**WHY:**")

        # Check for blocking robot
        blockers = [n for n in nearby if n.get("idle_or_error") and n["distance"] < 3]
        if blockers:
            blocker = blockers[0]
            lines.append(
                f"{context['robot_id']} was trying to proceed but {blocker['id']} "
                f"({blocker['vendor']}) is {'idle' if blocker['status'] == 'idle' else 'in error state'} "
                f"at {blocker['position']}, just {blocker['distance']}m away, "
                f"directly blocking the path."
            )
        elif battery < 10:
            lines.append(
                f"{context['robot_id']} has critically low battery ({battery}%). "
                f"The robot likely ran out of power before completing its task or reaching a charger. "
                f"Nearest charging station is {context['nearest_charger']['name']} "
                f"({context['nearest_charger']['distance']}m away)."
            )
        elif context.get("error_doc"):
            doc = context["error_doc"]
            lines.append(
                f"Error {error_code} indicates: {doc['description']} "
                f"Common causes include: {'; '.join(doc['common_causes'][:2])}."
            )
        else:
            lines.append(
                f"The exact cause requires further investigation. The robot reported "
                f"error {error_code} which may be related to environmental conditions "
                f"or hardware issues."
            )

        # Suggested fix
        lines.append(f"\n**SUGGESTED FIX:**")
        step = 1

        if blockers:
            blocker = blockers[0]
            lines.append(f"{step}. Move {blocker['id']} — assign it a new task or send to parking")
            step += 1
            lines.append(f"{step}. {context['robot_id']} should resume automatically once path clears")
            step += 1
        elif battery < 10:
            lines.append(f"{step}. Manually transport {context['robot_id']} to {context['nearest_charger']['name']}")
            step += 1
            if context.get("task"):
                lines.append(f"{step}. Reassign task {context['task'].get('task_id', 'N/A')} to another robot")
                step += 1
        elif context.get("error_doc"):
            for s in context["error_doc"].get("remediation_steps", [])[:3]:
                lines.append(f"{step}. {s}")
                step += 1
        else:
            lines.append(f"{step}. Check the robot's immediate surroundings for obstacles")
            step += 1
            lines.append(f"{step}. Try clearing the error and reassigning the task")
            step += 1

        # Pattern detection
        location_errors = context.get("same_location_errors", [])
        robot_errors = context.get("same_robot_errors", [])

        lines.append(f"\n**PATTERN WARNING:**")
        if len(location_errors) >= 3:
            lines.append(
                f"⚠️ This location has seen {len(location_errors)} errors recently. "
                f"This may indicate a recurring obstruction or design issue. "
                f"Consider adding an alternate route or marking this as a no-idle zone."
            )
        elif len(robot_errors) >= 3:
            lines.append(
                f"⚠️ {context['robot_id']} has had {len(robot_errors)} errors recently. "
                f"Consider scheduling maintenance or inspection for this robot."
            )
        else:
            lines.append("No recurring patterns detected.")

        return "\n".join(lines)

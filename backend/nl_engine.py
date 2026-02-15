"""
Natural Language Engine for FleetBridge.
Uses Google Gemini to interpret operator queries and generate responses
based on real-time fleet data, alerts, analytics, and task catalog.
"""

from __future__ import annotations

import json
import os
import uuid
from datetime import datetime
from typing import Any, Optional

from models import (
    ChatResponse,
    RobotStatus,
    UnifiedRobotState,
)
from simulator import FleetSimulator
from error_kb import lookup_error, search_errors, get_equivalent_errors, ALL_ERRORS

# Conversation history store
_conversations: dict[str, list[dict]] = {}


def _get_fleet_context(simulator: FleetSimulator) -> str:
    """Build a comprehensive text summary of the current fleet state for the LLM."""
    robots = simulator.get_all_unified()
    summary = simulator.get_fleet_summary()

    lines = [
        f"═══ FLEET STATUS (as of {datetime.now().strftime('%H:%M:%S')}) ═══",
        f"Total robots: {summary['total_robots']}",
        f"  Active: {summary['active']}, Idle: {summary['idle']}, "
        f"Error: {summary['error']}, Charging: {summary['charging']}, "
        f"Offline: {summary['offline']}",
        f"Vendors: Amazon Normal ({summary['vendors']['Amazon Normal']}), "
        f"Balyo ({summary['vendors']['Balyo']}), "
        f"Amazon Internal ({summary['vendors']['Amazon Internal']})",
        "",
    ]

    # ── Fleet-wide metrics ──
    total_tasks = sum(r.tasks_completed for r in simulator.robots.values())
    total_distance = sum(r.total_distance for r in simulator.robots.values())
    total_errors = sum(len(r.error_history) for r in simulator.robots.values())
    avg_battery = sum(r.battery for r in robots) / len(robots) if robots else 0

    lines.append("═══ KEY METRICS ═══")
    lines.append(f"  Total tasks completed: {total_tasks}")
    lines.append(f"  Total distance: {total_distance * 0.025:.1f} km")
    lines.append(f"  Total errors today: {total_errors}")
    lines.append(f"  Average battery: {avg_battery:.0f}%")
    lines.append(f"  Lowest battery: {min(r.battery for r in robots):.0f}% ({min(robots, key=lambda r: r.battery).id})")
    lines.append("")

    # ── Per-vendor summary ──
    lines.append("═══ VENDOR BREAKDOWN ═══")
    vendor_groups: dict[str, list] = {"Amazon Normal": [], "Balyo": [], "Amazon Internal": []}
    for r in simulator.robots.values():
        vendor_groups[r.vendor].append(r)

    for vendor, group in vendor_groups.items():
        if not group:
            continue
        v_tasks = sum(r.tasks_completed for r in group)
        v_errors = sum(len(r.error_history) for r in group)
        v_avg_battery = sum(r.battery for r in group) / len(group)
        v_active = sum(1 for r in group if r.status == RobotStatus.ACTIVE)
        v_idle = sum(1 for r in group if r.status == RobotStatus.IDLE)
        v_error = sum(1 for r in group if r.status == RobotStatus.ERROR)
        v_charging = sum(1 for r in group if r.status == RobotStatus.CHARGING)
        lines.append(
            f"  {vendor} ({len(group)} robots): "
            f"Tasks={v_tasks}, Errors={v_errors}, AvgBatt={v_avg_battery:.0f}%, "
            f"Active={v_active}, Idle={v_idle}, Error={v_error}, Charging={v_charging}"
        )
    lines.append("")

    # ── Active alerts ──
    lines.append("═══ ACTIVE ALERTS ═══")
    try:
        from conflict_engine import ConflictEngine
        # Access alerts via the global conflict_engine
        import main as main_module
        if main_module.conflict_engine:
            active_alerts = main_module.conflict_engine.get_active_alerts()
            if active_alerts:
                for alert in active_alerts[:10]:  # Cap at 10
                    lines.append(
                        f"  [{alert.severity.value.upper()}] {alert.title} — {alert.description} "
                        f"(Robots: {', '.join(alert.affected_robots)})"
                    )
            else:
                lines.append("  No active alerts.")
        else:
            lines.append("  Alert engine not available.")
    except Exception:
        lines.append("  Alert data unavailable.")
    lines.append("")

    # ── Zone occupancy ──
    lines.append("═══ ZONE OCCUPANCY ═══")
    from facility import ZONES
    for zone_name, bounds in ZONES.items():
        zone_robots = [
            r for r in robots
            if bounds["x_min"] <= r.position.x <= bounds["x_max"]
            and bounds["y_min"] <= r.position.y <= bounds["y_max"]
        ]
        if zone_robots:
            ids = [r.id for r in zone_robots]
            lines.append(f"  {zone_name}: {len(zone_robots)} robots ({', '.join(ids)})")
    lines.append("")

    # ── Robots with errors ──
    error_robots = [r for r in robots if r.status == RobotStatus.ERROR or (r.last_error and not r.last_error.resolved)]
    if error_robots:
        lines.append("═══ ROBOTS WITH ERRORS ═══")
        for r in error_robots:
            err_code = r.last_error.error_code if r.last_error else "Unknown"
            err_name = r.last_error.name if r.last_error else ""
            resolved = " [RESOLVED]" if r.last_error and r.last_error.resolved else ""
            lines.append(
                f"  {r.id} ({r.vendor}): Error {err_code} ({err_name}){resolved} | "
                f"Battery: {r.battery:.0f}% | Zone: {r.zone}"
            )
        lines.append("")

    # ── Low battery robots ──
    low_batt = [r for r in robots if r.battery < 25]
    if low_batt:
        low_batt.sort(key=lambda r: r.battery)
        lines.append("═══ LOW BATTERY ROBOTS (<25%) ═══")
        for r in low_batt:
            lines.append(f"  {r.id} ({r.vendor}): {r.battery:.0f}% — Status: {r.status.value}")
        lines.append("")

    # ── All robots detail ──
    lines.append("═══ ALL ROBOTS ═══")
    for r in robots:
        task_info = "No task"
        if r.current_task:
            task_info = (
                f"Task {r.current_task.task_id}: {r.current_task.task_type} "
                f"from {r.current_task.from_station} to {r.current_task.to_station}"
                f"{f' (ETA: {r.current_task.eta_seconds:.0f}s)' if r.current_task.eta_seconds else ''}"
            )

        error_info = ""
        if r.last_error:
            error_info = f" | Error: {r.last_error.error_code} ({r.last_error.name})"
            if r.last_error.resolved:
                error_info += " [RESOLVED]"

        lines.append(
            f"  {r.id} | {r.vendor} | {r.model} | {r.status.value} | "
            f"Batt: {r.battery:.0f}% | Pos: ({r.position.x:.1f}, {r.position.y:.1f}) | "
            f"Zone: {r.zone} | Speed: {r.speed:.1f} m/s | {task_info}{error_info}"
        )

    return "\n".join(lines)


def _get_analytics_context(simulator: FleetSimulator) -> str:
    """Build analytics summary for deeper analysis queries."""
    try:
        import main as main_module
        if main_module.analytics_engine:
            ae = main_module.analytics_engine
            summary = ae.get_daily_summary()
            vendor_data = ae.get_vendor_comparison()
            zone_data = ae.get_zone_analysis()

            lines = [
                "═══ ANALYTICS SUMMARY ═══",
                f"Today's total tasks: {summary.total_tasks}",
                f"Total distance: {summary.total_distance_km} km",
                f"Average task time: {summary.avg_task_time_min} min",
                f"Fleet uptime: {summary.uptime_percent}%",
                "",
                "Vendor Comparison:",
            ]
            for v in vendor_data:
                lines.append(
                    f"  {v.vendor}: {v.total_tasks} tasks ({v.tasks_per_robot}/robot), "
                    f"Avg time: {v.avg_task_time_min}min, Errors: {v.total_errors} ({v.error_rate_percent}%), "
                    f"Uptime: {v.uptime_percent}%, Avg Battery: {v.avg_battery}%"
                )
            lines.append("")
            lines.append("Zone Activity:")
            for z in zone_data:
                lines.append(
                    f"  {z.zone}: {z.robot_count} robots, {z.task_count} tasks, "
                    f"{z.error_count} errors, Avg wait: {z.avg_wait_time_min}min, Activity: {z.activity_level}"
                )

            if summary.top_errors:
                lines.append("")
                lines.append("Top Errors Today:")
                for e in summary.top_errors:
                    lines.append(f"  {e['code']} ({e['name']}): {e['count']} occurrences")

            return "\n".join(lines)
    except Exception:
        pass
    return ""


SYSTEM_PROMPT = """You are FleetBridge AI — an elite intelligent assistant for a robot fleet management system at a warehouse. You help operators monitor, analyze, and command robots from 3 vendors:
- **Amazon Normal** (8 Proteus AMR robots, IDs: AR-001 to AR-008) — cyan color
- **Balyo** (8 B-Matic AMR robots, IDs: BALYO-001 to BALYO-008) — green color
- **Amazon Internal** (8 Custom AGV-X robots, IDs: AMZN-001 to AMZN-008) — amber color

## YOUR CAPABILITIES
1. **Fleet Status** — Report on individual robots or the whole fleet
2. **Error Analysis** — Explain error codes, suggest fixes, identify patterns
3. **Performance Analysis** — Compare vendors, identify top/bottom performers, throughput metrics
4. **Predictive Insights** — Forecast battery issues, congestion risks, capacity bottlenecks
5. **Alert Triage** — Explain active alerts, prioritize which to address first
6. **Zone Intelligence** — Traffic analysis, congestion hotspots, optimal routing suggestions
7. **Task Management** — Recommend task assignments, balance workloads across vendors
8. **Root Cause Analysis** — When errors occur, investigate what happened and why

## RESPONSE RULES
- Be **concise but insightful**. Lead with the answer, then provide supporting data.
- Use **markdown formatting**: headers (##), bullet points, **bold** for emphasis, `code` for IDs/codes.
- When mentioning robots, always include ID (e.g., `AR-003`) and vendor.
- Include **specific numbers** — battery %, positions, speeds, task counts — when relevant.
- **Proactively flag issues** you notice even if not asked (e.g., "I also notice AR-005 is at 12% battery").
- For errors, reference **specific error codes** and explain in plain English.
- When comparing vendors, use **comparative language** ("Amazon Normal outperforms Balyo by 23% in tasks/robot").
- Suggest **actionable next steps** — not just information.
- Always end with 2-3 natural **follow-up questions** the operator might want to ask.

## RESPONSE FORMAT
Respond with a JSON object:
{
  "response": "Your markdown-formatted response text",
  "robot_ids": ["AR-001", "BALYO-003"],  // IDs mentioned or relevant
  "suggested_followups": ["Follow-up question 1", "Follow-up question 2", "Follow-up question 3"],
  "response_type": "status|analysis|recommendation|error_lookup|action"
}

response_type categories:
- "status" — simple fleet/robot status queries
- "analysis" — comparative or deep-dive analytics
- "recommendation" — proactive suggestions to improve operations
- "error_lookup" — error code explanations and troubleshooting
- "action" — command suggestions (pause, charge, reassign)

You have access to real-time fleet data, analytics, and alert information which is provided with each query."""


async def process_query(
    query: str,
    simulator: FleetSimulator,
    conversation_id: Optional[str] = None,
) -> ChatResponse:
    """Process a natural language query and return a response."""
    # Generate conversation ID if needed
    if not conversation_id:
        conversation_id = str(uuid.uuid4())[:8]

    # Get or create conversation history
    if conversation_id not in _conversations:
        _conversations[conversation_id] = []

    history = _conversations[conversation_id]

    # Build fleet context
    robots = simulator.get_all_unified()
    fleet_context = _get_fleet_context(simulator)

    # Build analytics context for analysis-type queries
    analytics_context = ""
    analysis_keywords = [
        "compare", "performance", "analytics", "trend", "average", "best", "worst",
        "top", "bottom", "throughput", "efficiency", "utilization", "how is", "how are",
        "analyze", "analysis", "report", "summary", "overview", "breakdown",
        "vendor", "zone", "uptime", "productivity", "populated", "busy", "congested",
        "crowded", "most", "least", "which", "what zone", "what is",
    ]
    if any(kw in query.lower() for kw in analysis_keywords):
        analytics_context = "\n\n" + _get_analytics_context(simulator)

    # Check for error code references in query
    error_context = ""
    words = query.replace(",", " ").replace("?", " ").split()
    for word in words:
        err = lookup_error(word.upper())
        if err:
            equiv = get_equivalent_errors(err.code)
            error_context += (
                f"\nERROR CODE INFO for {err.code}:\n"
                f"  Vendor: {err.vendor}\n"
                f"  Name: {err.name}\n"
                f"  Severity: {err.severity.value}\n"
                f"  Description: {err.description}\n"
                f"  Common causes: {'; '.join(err.common_causes)}\n"
                f"  Fix steps: {'; '.join(err.remediation_steps)}\n"
                f"  Auto-recoverable: {err.auto_recoverable}\n"
            )
            if equiv:
                error_context += "  Equivalent errors from other vendors:\n"
                for e in equiv:
                    error_context += f"    - {e.code} ({e.vendor}): {e.name}\n"

    # Search for error-related info if query mentions errors generically
    if any(kw in query.lower() for kw in ["error", "errors", "failing", "broken", "issue", "problem"]):
        # Search for error keywords from the query
        for word in words:
            if len(word) > 3 and word.lower() not in ["error", "errors", "what", "which", "robot", "robots", "have", "with", "today"]:
                results = search_errors(word)
                if results and not error_context:
                    for r in results[:3]:
                        error_context += (
                            f"\nRelated error: {r.code} ({r.vendor}): {r.name} — {r.description}\n"
                        )

    # Check if the fallback can handle this query locally (instant response)
    _fallback_patterns = [
        # Location
        "where is", "where's", "location of", "find ",
        # Status
        "fleet status", "how many", "status", "what's the fleet",
        # Battery
        "battery", "charge", "low battery", "below",
        # Errors
        "error", "errors", "failing", "broken", "issue",
        # Alerts
        "alert", "alerts", "warning", "critical",
        # Performance
        "top performer", "best robot", "worst robot", "ranking",
        # Comparison
        "compare", "vs", "versus", "comparison",
        # Zones
        "zone", "populated", "congested", "crowded",
        # Robot spotlight
        "tell me more", "tell me about", "show me a robot", "pick a robot",
        "describe a robot", "random robot", "spotlight", "one of these robots",
        "about a robot",
    ]
    ql = query.lower()
    use_fallback = any(pat in ql for pat in _fallback_patterns)

    # Also use fallback if query contains a specific robot ID
    if not use_fallback:
        for r in robots:
            if r.id.lower() in ql:
                use_fallback = True
                break

    # Also use fallback if query contains a specific error code
    if not use_fallback:
        for word in words:
            if lookup_error(word.upper()):
                use_fallback = True
                break

    if use_fallback:
        response_data = _generate_fallback_response(query, simulator)
    else:
        # Build the prompt for the LLM
        user_message = f"""CURRENT FLEET DATA:
{fleet_context}
{analytics_context}
{error_context}

OPERATOR QUESTION: {query}

Respond with a JSON object containing "response" (markdown text), "robot_ids" (list), "suggested_followups" (list of 3), and "response_type" (one of: status, analysis, recommendation, error_lookup, action)."""

        # Add to conversation history
        history.append({"role": "user", "content": user_message})

        # Try Gemini API
        try:
            response_data = await _call_gemini(history)
        except Exception as e:
            import logging
            logging.warning(f"Gemini API failed: {type(e).__name__}: {e}")
            response_data = _generate_fallback_response(query, simulator)

    # Parse response
    response_text = response_data.get("response", "I couldn't process that query. Please try again.")
    robot_ids = response_data.get("robot_ids", [])
    followups = response_data.get("suggested_followups", [])
    response_type = response_data.get("response_type", "status")

    # Add assistant response to history
    history.append({"role": "assistant", "content": response_text})

    # Keep conversation history manageable
    if len(history) > 20:
        history[:] = history[-20:]

    return ChatResponse(
        response=response_text,
        conversation_id=conversation_id,
        robot_ids=robot_ids,
        suggested_followups=followups,
        response_type=response_type,
    )


_GEMINI_MODELS = ["gemini-2.5-flash", "gemini-2.0-flash", "gemini-2.0-flash-lite"]


async def _call_gemini(history: list[dict]) -> dict:
    """Call Google Gemini REST API directly via httpx with model fallback."""
    import httpx
    import logging

    api_key = os.getenv("GEMINI_API_KEY", "")
    if not api_key:
        raise ValueError("GEMINI_API_KEY not set")

    # Build contents array with system instruction + conversation
    contents = []
    # Add conversation history (all but last message)
    for msg in history[:-1]:
        role = "user" if msg["role"] == "user" else "model"
        contents.append({"role": role, "parts": [{"text": msg["content"]}]})

    # Add final message with system prompt prepended
    full_prompt = f"{SYSTEM_PROMPT}\n\n{history[-1]['content']}"
    contents.append({"role": "user", "parts": [{"text": full_prompt}]})

    payload = {
        "contents": contents,
        "generationConfig": {
            "temperature": 0.7,
            "maxOutputTokens": 8192,
        },
    }

    last_error = None
    async with httpx.AsyncClient(timeout=30.0) as client:
        for model_name in _GEMINI_MODELS:
            url = f"https://generativelanguage.googleapis.com/v1beta/models/{model_name}:generateContent?key={api_key}"
            try:
                resp = await client.post(url, json=payload)
                if resp.status_code == 429:
                    logging.warning(f"Gemini {model_name}: rate limited, trying next model")
                    last_error = Exception(f"Rate limited on {model_name}")
                    continue
                resp.raise_for_status()
                data = resp.json()

                # Extract text from response
                text = data["candidates"][0]["content"]["parts"][0]["text"]
                logging.info(f"Gemini {model_name}: success")
                return _parse_gemini_response(text)

            except httpx.HTTPStatusError as e:
                logging.warning(f"Gemini {model_name}: HTTP {e.response.status_code}")
                last_error = e
                continue
            except Exception as e:
                logging.warning(f"Gemini {model_name}: {type(e).__name__}: {e}")
                last_error = e
                continue

    raise last_error or Exception("All Gemini models failed")


def _parse_gemini_response(text: str) -> dict:
    """Parse JSON from Gemini response text."""
    import re
    import logging

    # Strategy 1: Extract JSON from code fences using regex (handles nested backticks)
    fence_match = re.search(r'```(?:json)?\s*(\{.*\})\s*```', text, re.DOTALL)
    if fence_match:
        try:
            parsed = json.loads(fence_match.group(1))
            parsed.setdefault("robot_ids", [])
            parsed.setdefault("suggested_followups", [])
            parsed.setdefault("response_type", "status")
            return parsed
        except json.JSONDecodeError:
            pass

    # Strategy 2: Find the outermost JSON object with brace matching
    start = text.find("{")
    if start != -1:
        depth = 0
        end = start
        for i in range(start, len(text)):
            if text[i] == "{":
                depth += 1
            elif text[i] == "}":
                depth -= 1
                if depth == 0:
                    end = i + 1
                    break
        try:
            parsed = json.loads(text[start:end])
            parsed.setdefault("robot_ids", [])
            parsed.setdefault("suggested_followups", [])
            parsed.setdefault("response_type", "status")
            return parsed
        except json.JSONDecodeError:
            logging.warning(f"Gemini JSON parse failed, returning raw text")

    # Strategy 3: Return raw text as-is
    return {"response": text, "robot_ids": [], "suggested_followups": [], "response_type": "status"}


def _generate_fallback_response(query: str, simulator: FleetSimulator) -> dict:
    """Generate a comprehensive response locally when Gemini is unavailable."""
    query_lower = query.lower()
    robots = simulator.get_all_unified()
    robot_ids: list[str] = []
    followups: list[str] = []

    # ── Location queries ──
    if any(kw in query_lower for kw in ["where is", "where's", "location of", "find"]):
        for r in robots:
            if r.id.lower() in query_lower or r.id.lower().replace("-", " ") in query_lower:
                robot_ids.append(r.id)
                task_info = "No active task"
                if r.current_task:
                    task_info = f"{r.current_task.task_type} to {r.current_task.to_station}"
                    if r.current_task.eta_seconds:
                        task_info += f" (ETA: {r.current_task.eta_seconds:.0f}s)"

                response = (
                    f"## 📍 {r.id} Location\n\n"
                    f"**{r.id}** ({r.vendor} {r.model}) is at position "
                    f"({r.position.x:.1f}, {r.position.y:.1f}) in **{r.zone}**.\n\n"
                    f"| Metric | Value |\n|--------|-------|\n"
                    f"| Status | {r.status.value} |\n"
                    f"| Battery | {r.battery:.0f}% |\n"
                    f"| Speed | {r.speed:.1f} m/s |\n"
                    f"| Current task | {task_info} |\n"
                )
                # Proactive insights
                if r.battery < 20:
                    response += f"\n⚠️ **Battery Warning**: {r.id} is at {r.battery:.0f}% — consider sending to charging."
                if r.status == RobotStatus.ERROR and r.last_error:
                    response += f"\n🔴 **Active Error**: {r.last_error.error_code} — {r.last_error.name}"

                followups = [
                    f"What task is {r.id} doing?",
                    f"Show me {r.id}'s error history",
                    f"Send {r.id} to charging",
                ]
                return {"response": response, "robot_ids": robot_ids, "suggested_followups": followups, "response_type": "status"}

        # Generic "where" for zones
        if "zone" in query_lower:
            for zone in ["zone a", "zone b", "zone c", "zone d", "zone e", "zone f"]:
                if zone in query_lower:
                    zone_name = zone.title()
                    zone_robots = [r for r in robots if r.zone == zone_name]
                    if zone_robots:
                        lines = [f"## 🗺️ {zone_name}\n\n**{len(zone_robots)} robots** currently in {zone_name}:\n"]
                        lines.append("| Robot | Vendor | Status | Battery | Task |")
                        lines.append("|-------|--------|--------|---------|------|")
                        for r in zone_robots:
                            robot_ids.append(r.id)
                            task = r.current_task.task_type if r.current_task else "—"
                            lines.append(f"| `{r.id}` | {r.vendor} | {r.status.value} | {r.battery:.0f}% | {task} |")
                        return {
                            "response": "\n".join(lines),
                            "robot_ids": robot_ids,
                            "suggested_followups": [
                                f"Are there any errors in {zone_name}?",
                                f"What's the activity level in {zone_name}?",
                                "Which zone has the most robots?",
                            ],
                            "response_type": "status",
                        }

    # ── Comparison / Analysis queries ──
    if any(kw in query_lower for kw in ["compare", "vs", "versus", "comparison", "better", "which vendor"]):
        raw_robots = list(simulator.robots.values())
        vendor_groups: dict[str, list] = {"Amazon Normal": [], "Balyo": [], "Amazon Internal": []}
        for r in raw_robots:
            vendor_groups[r.vendor].append(r)

        lines = ["## 📊 Vendor Performance Comparison\n"]
        lines.append("| Metric | Amazon Normal | Balyo | Amazon Internal |")
        lines.append("|--------|--------------|-------|-----------------|")

        data: dict[str, dict] = {}
        for vendor, group in vendor_groups.items():
            if not group:
                continue
            tasks = sum(r.tasks_completed for r in group)
            in_progress = sum(1 for r in group if r.task and r.status == RobotStatus.ACTIVE)
            errors = sum(len(r.error_history) for r in group)
            avg_batt = sum(r.battery for r in group) / len(group)
            active = sum(1 for r in group if r.status == RobotStatus.ACTIVE)
            idle = sum(1 for r in group if r.status == RobotStatus.IDLE)
            charging = sum(1 for r in group if r.status == RobotStatus.CHARGING)
            error_count = sum(1 for r in group if r.status == RobotStatus.ERROR)
            total_dist = sum(r.total_distance for r in group) * 0.025  # grid to km
            data[vendor] = {
                "tasks": tasks,
                "tasks_per_robot": round(tasks / len(group), 1),
                "in_progress": in_progress,
                "errors": errors,
                "avg_battery": round(avg_batt, 0),
                "active": active,
                "idle": idle,
                "charging": charging,
                "error_status": error_count,
                "count": len(group),
                "distance_km": round(total_dist, 1),
            }

        an = data.get("Amazon Normal", {})
        ba = data.get("Balyo", {})
        ai = data.get("Amazon Internal", {})

        lines.append(f"| Robots | {an.get('count', 0)} | {ba.get('count', 0)} | {ai.get('count', 0)} |")
        lines.append(f"| Tasks Completed | {an.get('tasks', 0)} | {ba.get('tasks', 0)} | {ai.get('tasks', 0)} |")
        lines.append(f"| Tasks/Robot | {an.get('tasks_per_robot', 0)} | {ba.get('tasks_per_robot', 0)} | {ai.get('tasks_per_robot', 0)} |")
        lines.append(f"| In Progress | {an.get('in_progress', 0)} | {ba.get('in_progress', 0)} | {ai.get('in_progress', 0)} |")
        lines.append(f"| Distance (km) | {an.get('distance_km', 0)} | {ba.get('distance_km', 0)} | {ai.get('distance_km', 0)} |")
        lines.append(f"| Errors | {an.get('errors', 0)} | {ba.get('errors', 0)} | {ai.get('errors', 0)} |")
        lines.append(f"| Avg Battery | {an.get('avg_battery', 0)}% | {ba.get('avg_battery', 0)}% | {ai.get('avg_battery', 0)}% |")
        lines.append(f"| Active | {an.get('active', 0)} | {ba.get('active', 0)} | {ai.get('active', 0)} |")
        lines.append(f"| Idle | {an.get('idle', 0)} | {ba.get('idle', 0)} | {ai.get('idle', 0)} |")
        lines.append(f"| Charging | {an.get('charging', 0)} | {ba.get('charging', 0)} | {ai.get('charging', 0)} |")

        # Find the best performer - use tasks, but if all 0, use active robots
        total_tasks = sum(d.get("tasks", 0) for d in data.values())
        if total_tasks > 0:
            best_vendor = max(data.items(), key=lambda x: x[1].get("tasks_per_robot", 0))
            lines.append(f"\n**🏆 Top Performer:** {best_vendor[0]} with {best_vendor[1]['tasks_per_robot']} tasks/robot")
        else:
            best_vendor = max(data.items(), key=lambda x: x[1].get("active", 0) / max(x[1].get("count", 1), 1))
            utilization = round(best_vendor[1].get("active", 0) / max(best_vendor[1].get("count", 1), 1) * 100)
            lines.append(f"\n**🏆 Most Active:** {best_vendor[0]} with {utilization}% utilization ({best_vendor[1]['active']}/{best_vendor[1]['count']} active)")

        worst_errors = max(data.items(), key=lambda x: x[1].get("errors", 0))
        if worst_errors[1].get("errors", 0) > 0:
            lines.append(f"**⚠️ Most Errors:** {worst_errors[0]} with {worst_errors[1]['errors']} total errors")

        # Battery insight
        lowest_batt = min(data.items(), key=lambda x: x[1].get("avg_battery", 100))
        if lowest_batt[1].get("avg_battery", 100) < 40:
            lines.append(f"**🔋 Low Battery:** {lowest_batt[0]} averaging {lowest_batt[1]['avg_battery']}% — consider charging")

        return {
            "response": "\n".join(lines),
            "robot_ids": [],
            "suggested_followups": [
                "Which vendor has the best uptime?",
                "Show me the top 5 performing robots",
                "Which robots need attention?",
            ],
            "response_type": "analysis",
        }

    # ── Status queries ──
    if any(kw in query_lower for kw in ["idle", "active", "error", "charging", "offline", "status"]):
        status_filter = None
        if "idle" in query_lower:
            status_filter = RobotStatus.IDLE
        elif "active" in query_lower:
            status_filter = RobotStatus.ACTIVE
        elif "error" in query_lower:
            status_filter = RobotStatus.ERROR
        elif "charging" in query_lower:
            status_filter = RobotStatus.CHARGING
        elif "offline" in query_lower:
            status_filter = RobotStatus.OFFLINE

        if status_filter:
            filtered = [r for r in robots if r.status == status_filter]
            robot_ids = [r.id for r in filtered]

            lines = [f"## {status_filter.value.upper()} Robots\n\n**{len(filtered)} robots** are currently {status_filter.value}:\n"]
            if filtered:
                lines.append("| Robot | Vendor | Battery | Zone | Task |")
                lines.append("|-------|--------|---------|------|------|")
                for r in filtered:
                    task = r.current_task.task_type if r.current_task else "—"
                    err = ""
                    if r.last_error and not r.last_error.resolved:
                        err = f" ⛔ {r.last_error.error_code}"
                    lines.append(f"| `{r.id}` | {r.vendor} | {r.battery:.0f}% | {r.zone} | {task}{err} |")

                # Proactive insight
                if status_filter == RobotStatus.IDLE and len(filtered) > 4:
                    lines.append(f"\n💡 **Insight:** {len(filtered)} idle robots is above average. Consider assigning tasks to improve throughput.")
                elif status_filter == RobotStatus.ERROR:
                    lines.append(f"\n🔴 **Action Required:** {len(filtered)} robots need error resolution.")
            else:
                lines.append(f"No robots are currently {status_filter.value}. ✅")

            followups = [
                "Tell me more about one of these robots",
                "What's the overall fleet status?",
                "Are there any alerts right now?",
            ]
            return {"response": "\n".join(lines), "robot_ids": robot_ids, "suggested_followups": followups, "response_type": "status"}

        # General status
        summary = simulator.get_fleet_summary()
        response = (
            f"## 🤖 Fleet Status Overview\n\n"
            f"| Status | Count | Percentage |\n"
            f"|--------|-------|------------|\n"
            f"| 🟢 Active | {summary['active']} | {summary['active']/summary['total_robots']*100:.0f}% |\n"
            f"| 🟡 Idle | {summary['idle']} | {summary['idle']/summary['total_robots']*100:.0f}% |\n"
            f"| 🔴 Error | {summary['error']} | {summary['error']/summary['total_robots']*100:.0f}% |\n"
            f"| 🔵 Charging | {summary['charging']} | {summary['charging']/summary['total_robots']*100:.0f}% |\n"
            f"| ⚫ Offline | {summary['offline']} | {summary['offline']/summary['total_robots']*100:.0f}% |\n\n"
            f"**Total:** {summary['total_robots']} robots across 3 vendors\n\n"
        )
        # Add fleet health indicator
        health_pct = (summary['active'] + summary['idle'] + summary['charging']) / summary['total_robots'] * 100
        if health_pct > 90:
            response += "**Fleet Health:** 🟢 Excellent — fleet is operating at high capacity."
        elif health_pct > 75:
            response += "**Fleet Health:** 🟡 Good — minor issues detected."
        else:
            response += f"**Fleet Health:** 🔴 Needs Attention — {summary['error']} robots in error state."

        return {
            "response": response,
            "robot_ids": [],
            "suggested_followups": [
                "Which robots have errors?",
                "Which robots are below 20% battery?",
                "Compare vendor performance",
            ],
            "response_type": "status",
        }

    # ── Battery queries ──
    if any(kw in query_lower for kw in ["battery", "charge", "power", "low battery"]):
        threshold = 20
        # Try to extract a threshold from the query
        for word in query_lower.split():
            if word.endswith("%"):
                try:
                    threshold = int(word.replace("%", ""))
                except ValueError:
                    pass
            elif word.isdigit():
                threshold = int(word)

        low_battery = [r for r in robots if r.battery < threshold]
        low_battery.sort(key=lambda r: r.battery)
        robot_ids = [r.id for r in low_battery]

        if low_battery:
            lines = [f"## 🔋 Low Battery Report\n\n**{len(low_battery)} robots** below {threshold}% battery:\n"]
            lines.append("| Robot | Vendor | Battery | Status | Zone |")
            lines.append("|-------|--------|---------|--------|------|")
            for r in low_battery:
                warning = " ⚠️" if r.battery < 10 else ""
                lines.append(f"| `{r.id}` | {r.vendor} | **{r.battery:.0f}%**{warning} | {r.status.value} | {r.zone} |")

            critical = [r for r in low_battery if r.battery < 10]
            if critical:
                lines.append(f"\n🚨 **Critical:** {len(critical)} robot(s) below 10% need immediate charging:")
                for r in critical:
                    lines.append(f"- `{r.id}` at {r.battery:.0f}%")

            # Recommendation
            non_charging = [r for r in low_battery if r.status != RobotStatus.CHARGING]
            if non_charging:
                lines.append(f"\n💡 **Recommendation:** Send {len(non_charging)} robots to charging stations to prevent downtime.")
        else:
            lines = [f"## 🔋 Battery Status\n\nAll robots have battery above {threshold}%. Fleet is healthy! ✅"]

        return {
            "response": "\n".join(lines),
            "robot_ids": robot_ids,
            "suggested_followups": [
                "Which robot has the lowest battery?",
                "Send low-battery robots to charging",
                "Show me the fleet status",
            ],
            "response_type": "recommendation" if low_battery else "status",
        }

    # ── Performance queries ──
    if any(kw in query_lower for kw in ["performance", "tasks", "completed", "best", "worst", "top", "productivity"]):
        raw_robots = list(simulator.robots.values())
        raw_robots.sort(key=lambda r: r.tasks_completed, reverse=True)

        total = sum(r.tasks_completed for r in raw_robots)
        lines = [f"## 🏆 Robot Performance Rankings\n\n**{total} total tasks** completed by the fleet.\n"]
        lines.append("| Rank | Robot | Vendor | Tasks | Errors | Status |")
        lines.append("|------|-------|--------|-------|--------|--------|")
        for i, r in enumerate(raw_robots[:10], 1):
            medal = "🥇" if i == 1 else ("🥈" if i == 2 else ("🥉" if i == 3 else f"{i}."))
            errors = len(r.error_history)
            status_icon = "🟢" if r.status == RobotStatus.ACTIVE else "🟡" if r.status == RobotStatus.IDLE else "🔴"
            lines.append(f"| {medal} | `{r.robot_id}` | {r.vendor} | {r.tasks_completed} | {errors} | {status_icon} {r.status.value} |")

        # Insight
        top = raw_robots[0]
        bottom = raw_robots[-1]
        lines.append(f"\n**🌟 MVP:** `{top.robot_id}` ({top.vendor}) with {top.tasks_completed} tasks")
        if bottom.tasks_completed < top.tasks_completed * 0.5:
            lines.append(f"**⚠️ Underperformer:** `{bottom.robot_id}` ({bottom.vendor}) with only {bottom.tasks_completed} tasks — investigate potential issues.")

        return {
            "response": "\n".join(lines),
            "robot_ids": [r.robot_id for r in raw_robots[:5]],
            "suggested_followups": [
                "Compare vendor performance",
                "Which robot has the most errors?",
                "Show me idle robots that could take more tasks",
            ],
            "response_type": "analysis",
        }

    # ── Alert queries ──
    if any(kw in query_lower for kw in ["alert", "alerts", "warning", "warnings", "critical", "issue", "issues"]):
        try:
            import main as main_module
            if main_module.conflict_engine:
                active_alerts = main_module.conflict_engine.get_active_alerts()
                if active_alerts:
                    lines = [f"## 🚨 Active Alerts\n\n**{len(active_alerts)} active alert(s):**\n"]

                    critical_alerts = [a for a in active_alerts if a.severity.value == "critical"]
                    warning_alerts = [a for a in active_alerts if a.severity.value == "warning"]
                    info_alerts = [a for a in active_alerts if a.severity.value == "info"]

                    if critical_alerts:
                        lines.append(f"### 🔴 Critical ({len(critical_alerts)})")
                        for a in critical_alerts:
                            lines.append(f"- **{a.title}** — {a.description}")
                            lines.append(f"  Robots: {', '.join(f'`{r}`' for r in a.affected_robots)}")
                            lines.append(f"  Action: {a.suggested_action}")
                            robot_ids.extend(a.affected_robots)

                    if warning_alerts:
                        lines.append(f"\n### 🟡 Warnings ({len(warning_alerts)})")
                        for a in warning_alerts:
                            lines.append(f"- **{a.title}** — {a.description}")
                            lines.append(f"  Robots: {', '.join(f'`{r}`' for r in a.affected_robots)}")
                            robot_ids.extend(a.affected_robots)

                    if info_alerts:
                        lines.append(f"\n### ℹ️ Info ({len(info_alerts)})")
                        for a in info_alerts:
                            lines.append(f"- {a.title} — {a.description}")

                    return {
                        "response": "\n".join(lines),
                        "robot_ids": list(set(robot_ids)),
                        "suggested_followups": [
                            "Tell me more about the critical alerts",
                            "Which robots are involved in deadlocks?",
                            "How can I resolve these alerts?",
                        ],
                        "response_type": "status",
                    }
                else:
                    return {
                        "response": "## ✅ No Active Alerts\n\nAll clear! No active alerts at this time. The fleet is operating normally.",
                        "robot_ids": [],
                        "suggested_followups": [
                            "What's the fleet status?",
                            "Show me robot performance",
                            "Are there any low-battery robots?",
                        ],
                        "response_type": "status",
                    }
        except Exception:
            pass

    # ── Zone queries ──
    if any(kw in query_lower for kw in ["zone", "populated", "busy", "congested", "crowded"]):
        from facility import ZONES
        zone_data: list[tuple[str, list]] = []
        for zone_name, bounds in ZONES.items():
            zone_robots_list = [
                r for r in robots
                if bounds["x_min"] <= r.position.x <= bounds["x_max"]
                and bounds["y_min"] <= r.position.y <= bounds["y_max"]
            ]
            zone_data.append((zone_name, zone_robots_list))

        zone_data.sort(key=lambda x: len(x[1]), reverse=True)

        lines = ["## 🗺️ Zone Occupancy Report\n"]
        lines.append("| Zone | Robots | Active | Idle | Error | Charging |")
        lines.append("|------|--------|--------|------|-------|----------|")
        for zname, zrobots in zone_data:
            active = sum(1 for r in zrobots if r.status == RobotStatus.ACTIVE)
            idle = sum(1 for r in zrobots if r.status == RobotStatus.IDLE)
            error = sum(1 for r in zrobots if r.status == RobotStatus.ERROR)
            charging = sum(1 for r in zrobots if r.status == RobotStatus.CHARGING)
            lines.append(f"| **{zname}** | {len(zrobots)} | {active} | {idle} | {error} | {charging} |")

        most = zone_data[0]
        least = zone_data[-1] if zone_data else zone_data[0]
        lines.append(f"\n**📍 Most Populated:** {most[0]} with **{len(most[1])} robots** ({', '.join(f'`{r.id}`' for r in most[1][:5])}{'...' if len(most[1]) > 5 else ''})")
        if least[0] != most[0]:
            lines.append(f"**📍 Least Populated:** {least[0]} with **{len(least[1])} robots**")

        # Flag congestion
        congested = [(z, rs) for z, rs in zone_data if len(rs) >= 6]
        if congested:
            lines.append(f"\n⚠️ **Congestion Warning:** {', '.join(z for z, _ in congested)} {'has' if len(congested) == 1 else 'have'} high robot density. Consider redistributing tasks.")

        robot_ids = [r.id for r in most[1]]
        return {
            "response": "\n".join(lines),
            "robot_ids": robot_ids[:5],
            "suggested_followups": [
                f"What robots are in {most[0]}?",
                "Are there any congestion alerts?",
                "Compare vendor performance by zone",
            ],
            "response_type": "analysis",
        }

    # ── Error code lookup ──
    if any(kw in query_lower for kw in ["error", "what does", "what is", "mean", "code"]):
        # Try to find error codes in the query
        words = query.replace(",", " ").replace("?", " ").split()
        for word in words:
            err = lookup_error(word.upper())
            if not err:
                results = search_errors(word)
                if results:
                    err = results[0]
            if err:
                equiv = get_equivalent_errors(err.code)
                equiv_text = ""
                if equiv:
                    equiv_text = "\n### Cross-Vendor Equivalents\n" + "\n".join(
                        f"- `{e.code}` ({e.vendor}): {e.name}" for e in equiv
                    )

                response = (
                    f"## 🔍 Error: {err.code}\n\n"
                    f"**{err.name}** | {err.vendor} | Severity: **{err.severity.value}**\n\n"
                    f"### What It Means\n{err.description}\n\n"
                    f"### Common Causes\n" + "\n".join(f"- {c}" for c in err.common_causes) + "\n\n"
                    f"### How to Fix\n" + "\n".join(f"{i+1}. {s}" for i, s in enumerate(err.remediation_steps))
                    + "\n\n"
                    f"Auto-recoverable: {'✅ Yes' if err.auto_recoverable else '❌ No — manual intervention required'}"
                    + equiv_text
                )

                # Check if any robot currently has this error
                affected = [r for r in robots if r.last_error and r.last_error.error_code == err.code and not r.last_error.resolved]
                if affected:
                    response += f"\n\n### Currently Affected Robots\n"
                    for r in affected:
                        response += f"- `{r.id}` ({r.vendor}) in {r.zone}\n"
                        robot_ids.append(r.id)

                return {
                    "response": response,
                    "robot_ids": robot_ids,
                    "suggested_followups": [
                        "Which robots have this error right now?",
                        f"Show me related errors to {err.code}",
                        "What are the most common errors today?",
                    ],
                    "response_type": "error_lookup",
                }

    # ── "Tell me more about a robot" handler ──
    robot_curiosity_kw = [
        "tell me more", "tell me about", "show me a robot", "pick a robot",
        "describe a robot", "random robot", "spotlight", "highlight a robot",
        "interesting robot", "one of these robots", "about a robot",
        "tell me about one", "more about one",
    ]
    if any(kw in query_lower for kw in robot_curiosity_kw):
        import random

        # Prioritise interesting robots: error > active task > low battery > random
        error_bots = [r for r in robots if r.status == RobotStatus.ERROR or (r.last_error and not r.last_error.resolved)]
        active_bots = [r for r in robots if r.current_task is not None]
        low_batt = [r for r in robots if r.battery < 30]

        if error_bots:
            pick = random.choice(error_bots)
        elif active_bots:
            pick = random.choice(active_bots)
        elif low_batt:
            pick = random.choice(low_batt)
        else:
            pick = random.choice(robots)

        sim_robot = simulator.robots.get(pick.id)
        tasks_done = sim_robot.tasks_completed if sim_robot else 0
        total_dist = (sim_robot.total_distance * 0.025) if sim_robot else 0
        err_count = len(sim_robot.error_history) if sim_robot else 0

        response = f"## Robot Spotlight: `{pick.id}`\n\n"
        response += f"| Field | Detail |\n|-------|--------|\n"
        response += f"| **Vendor** | {pick.vendor} |\n"
        response += f"| **Model** | {pick.model} |\n"
        response += f"| **Status** | {pick.status.value.upper()} |\n"
        response += f"| **Battery** | {pick.battery:.0f}% |\n"
        response += f"| **Zone** | {pick.zone} |\n"
        response += f"| **Position** | ({pick.position.x:.1f}, {pick.position.y:.1f}) |\n"
        response += f"| **Speed** | {pick.speed:.1f} m/s |\n"
        response += f"| **Tasks Done** | {tasks_done} |\n"
        response += f"| **Distance** | {total_dist:.2f} km |\n"
        response += f"| **Errors Today** | {err_count} |\n\n"

        if pick.current_task:
            t = pick.current_task
            eta = f" (ETA: {t.eta_seconds:.0f}s)" if t.eta_seconds else ""
            response += f"### Current Task\n"
            response += f"**{t.task_type}** — {t.from_station} → {t.to_station}{eta}\n\n"

        if pick.last_error:
            e = pick.last_error
            resolved_tag = " ✅ Resolved" if e.resolved else " ⚠️ Active"
            response += f"### Last Error\n"
            response += f"`{e.error_code}` — {e.name}{resolved_tag}\n"
            response += f"{e.description}\n\n"

        if pick.recent_activity:
            response += f"### Recent Activity\n"
            for act in pick.recent_activity[-5:]:
                response += f"- {act.description}\n"

        return {
            "response": response,
            "robot_ids": [pick.id],
            "suggested_followups": [
                f"What errors has {pick.id} had today?",
                f"Compare {pick.id} with other {pick.vendor} robots",
                "Tell me about another robot",
            ],
            "response_type": "status",
        }

    # ── Default fallback ──
    summary = simulator.get_fleet_summary()
    total_tasks = sum(r.tasks_completed for r in simulator.robots.values())
    total_errors = sum(len(r.error_history) for r in simulator.robots.values())

    response = (
        f"## 🤖 FleetBridge AI\n\n"
        f"I'm your fleet management assistant. Here's a quick overview:\n\n"
        f"| Metric | Value |\n|--------|-------|\n"
        f"| Total Robots | {summary['total_robots']} |\n"
        f"| Active | {summary['active']} |\n"
        f"| Tasks Completed | {total_tasks} |\n"
        f"| Errors Today | {total_errors} |\n\n"
        f"### What I Can Help With\n\n"
        f"- 📍 **\"Where is AR-003?\"** — Locate any robot\n"
        f"- 🔴 **\"Which robots have errors?\"** — Error analysis\n"
        f"- 🔋 **\"Show robots below 20% battery\"** — Battery monitoring\n"
        f"- 📊 **\"Compare vendor performance\"** — Analytics & comparisons\n"
        f"- 🚨 **\"Are there any alerts?\"** — Active alert triage\n"
        f"- 🏆 **\"Show me top performers\"** — Robot rankings\n"
        f"- 🗺️ **\"What's happening in Zone A?\"** — Zone intelligence"
    )
    return {
        "response": response,
        "robot_ids": [],
        "suggested_followups": [
            "What's the fleet status?",
            "Which robots have errors?",
            "Compare Amazon Normal vs Balyo performance",
        ],
        "response_type": "status",
    }


# ────────────────────────────────────────────────────────
#  Natural-Language Task Assignment
# ────────────────────────────────────────────────────────

TASK_PARSE_PROMPT = """You are a warehouse task parser. A human operator is giving a plain-English instruction
to assign a task to a specific robot. Parse it into structured JSON.

AVAILABLE TASK TYPES (with IDs):
{task_list}

AVAILABLE STATIONS: {station_list}
AVAILABLE CHARGING STATIONS: {charger_list}
AVAILABLE ZONES: {zone_list}

ROBOT INFO:
  ID: {robot_id}
  Vendor: {vendor}
  Current Zone: {zone}
  Current Position: ({x:.0f}, {y:.0f})
  Status: {status}
  Battery: {battery:.0f}%

OPERATOR INSTRUCTION: "{instruction}"

Parse this instruction into a JSON object:
{{
  "catalog_task_id": "<task id from the list above, or 'inter_area_transport' if unclear>",
  "task_type": "<display name of the task>",
  "from_station": "<station name, or null to auto-pick>",
  "to_station": "<station name, or null to auto-pick>",
  "confidence": <0.0 to 1.0 — how confident you are in the parse>,
  "interpretation": "<one-sentence plain-English summary of what the robot will do>"
}}

Rules:
- Pick the closest matching task from the catalog. The task MUST be in the list above.
- If the instruction mentions a zone (e.g. "Zone A", "packing area"), pick the nearest station in/near that zone.
- If the instruction mentions "charge" or "battery", use catalog_task_id = null and set to_station to a charging station.
- If from/to aren't clear, set them to null — the system will auto-assign.
- Always provide an interpretation explaining what you understood.

Respond with ONLY the JSON object, no markdown or extra text."""


async def parse_nl_task(
    instruction: str,
    robot_id: str,
    simulator: FleetSimulator,
) -> dict:
    """Parse a natural-language task instruction into structured task parameters using the LLM."""
    from task_catalog import TASK_CATALOG, get_tasks_for_vendor
    from facility import STATIONS, CHARGING_STATIONS, ZONES

    robot = simulator.get_robot_unified(robot_id)
    if not robot:
        return {
            "success": False,
            "error": f"Robot {robot_id} not found",
        }

    # Build task list for the prompt (only tasks this vendor can do)
    vendor_tasks = get_tasks_for_vendor(robot.vendor)
    task_lines = "\n".join(
        f"  - id: \"{t.id}\" | name: \"{t.name}\" | category: {t.category} | description: {t.description}"
        for t in vendor_tasks
    )

    station_names = ", ".join(STATIONS.keys())
    charger_names = ", ".join(CHARGING_STATIONS.keys())
    zone_names = ", ".join(ZONES.keys())

    prompt = TASK_PARSE_PROMPT.format(
        task_list=task_lines,
        station_list=station_names,
        charger_list=charger_names,
        zone_list=zone_names,
        robot_id=robot.id,
        vendor=robot.vendor,
        zone=robot.zone,
        x=robot.position.x,
        y=robot.position.y,
        status=robot.status.value,
        battery=robot.battery,
        instruction=instruction,
    )

    # Try LLM
    parsed = None
    try:
        import google.generativeai as genai

        api_key = os.getenv("GEMINI_API_KEY", "")
        if not api_key:
            raise ValueError("No API key")

        genai.configure(api_key=api_key)
        model = genai.GenerativeModel("gemini-2.0-flash")
        response = await model.generate_content_async(prompt)
        text = response.text.strip()

        # Extract JSON
        if "```json" in text:
            text = text.split("```json")[1].split("```")[0].strip()
        elif "```" in text:
            text = text.split("```")[1].split("```")[0].strip()

        parsed = json.loads(text)
    except Exception:
        # Fallback: keyword-based matching
        parsed = _fallback_parse_task(instruction, robot, vendor_tasks)

    if not parsed:
        parsed = _fallback_parse_task(instruction, robot, vendor_tasks)

    return {
        "success": True,
        "catalog_task_id": parsed.get("catalog_task_id"),
        "task_type": parsed.get("task_type", "Transport"),
        "from_station": parsed.get("from_station"),
        "to_station": parsed.get("to_station"),
        "confidence": parsed.get("confidence", 0.5),
        "interpretation": parsed.get("interpretation", "Assign transport task to robot"),
    }


def _fallback_parse_task(
    instruction: str,
    robot: "UnifiedRobotState",
    vendor_tasks: list,
) -> dict:
    """Keyword-based fallback when LLM is unavailable."""
    from facility import STATIONS, CHARGING_STATIONS, ZONES
    instruction_lower = instruction.lower()

    # Try to match a catalog task by keyword
    best_task = None
    best_score = 0
    for t in vendor_tasks:
        score = 0
        keywords = t.name.lower().split() + t.description.lower().split() + t.category.lower().split()
        for kw in keywords:
            if len(kw) > 3 and kw in instruction_lower:
                score += 1
        if score > best_score:
            best_score = score
            best_task = t

    if not best_task and vendor_tasks:
        # Default to inter_area_transport if available, else first
        best_task = next((t for t in vendor_tasks if t.id == "inter_area_transport"), vendor_tasks[0])

    # Try to match stations mentioned
    from_station = None
    to_station = None
    for name in STATIONS:
        name_lower = name.lower()
        if name_lower in instruction_lower:
            if from_station is None:
                from_station = name
            else:
                to_station = name

    # Try to match zones and find nearest station
    for zone_name, bounds in ZONES.items():
        if zone_name.lower() in instruction_lower:
            # Find station nearest to zone center
            cx = (bounds["x_min"] + bounds["x_max"]) / 2
            cy = (bounds["y_min"] + bounds["y_max"]) / 2
            nearest = min(
                STATIONS.items(),
                key=lambda s: (s[1].x - cx) ** 2 + (s[1].y - cy) ** 2,
            )
            if to_station is None:
                to_station = nearest[0]
            elif from_station is None:
                from_station = nearest[0]

    # Check for charging keywords
    if any(kw in instruction_lower for kw in ["charge", "charging", "battery", "recharge"]):
        from facility import get_nearest_charging_station
        charger_name, _, _ = get_nearest_charging_station(robot.position.x, robot.position.y)
        return {
            "catalog_task_id": None,
            "task_type": "Send to Charging",
            "from_station": None,
            "to_station": charger_name,
            "confidence": 0.7,
            "interpretation": f"Send {robot.id} to nearest charging station ({charger_name})",
        }

    return {
        "catalog_task_id": best_task.id if best_task else "inter_area_transport",
        "task_type": best_task.name if best_task else "Inter-Area Transport",
        "from_station": from_station,
        "to_station": to_station,
        "confidence": 0.6 if best_score > 0 else 0.3,
        "interpretation": (
            f"Assign '{best_task.name if best_task else 'transport'}' task to {robot.id}"
            + (f" from {from_station}" if from_station else "")
            + (f" to {to_station}" if to_station else "")
        ),
    }

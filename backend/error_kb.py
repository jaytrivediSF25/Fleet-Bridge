"""
Error Knowledge Base for FleetBridge.
Contains 33 error codes across 3 vendors with plain-English explanations,
common causes, and remediation steps.
"""
from __future__ import annotations

from models import ErrorCodeEntry, ErrorSeverity

# --- Amazon Normal Error Codes ---
AR_ERRORS: list[ErrorCodeEntry] = [
    ErrorCodeEntry(
        code="E-1001",
        vendor="Amazon Normal",
        models="All Amazon Normal AMRs",
        name="Emergency Stop Activated",
        description="The robot's emergency stop button has been pressed, or an external e-stop signal was received. The robot has immediately halted all motion and is waiting for manual reset.",
        common_causes=[
            "Operator pressed the physical e-stop button on the robot",
            "External safety system triggered an emergency stop",
            "Safety scanner detected a person too close to the robot at high speed",
        ],
        remediation_steps=[
            "Ensure the area around the robot is clear of people and obstacles",
            "Release the physical e-stop button (twist to release)",
            "Press the reset button on the robot's control panel",
            "The robot will run a self-check and resume if all systems are nominal",
        ],
        severity=ErrorSeverity.CRITICAL,
        auto_recoverable=False,
        related_errors=["E-1005", "E-5001"],
        keywords=["emergency", "stop", "e-stop", "halted", "safety"],
    ),
    ErrorCodeEntry(
        code="E-1005",
        vendor="Amazon Normal",
        models="All Amazon Normal AMRs",
        name="Battery Critical",
        description="The robot's battery has dropped below the critical threshold (5%). The robot has stopped to prevent complete battery depletion which could damage the battery cells.",
        common_causes=[
            "Robot was not sent to charging station in time",
            "Battery degradation — robot's battery capacity has decreased over time",
            "Task was too long for remaining battery level",
            "Charging station was occupied when robot tried to charge",
        ],
        remediation_steps=[
            "Manually transport the robot to the nearest charging station",
            "If the robot can still move, send it a direct charge command",
            "Check if the assigned charging station is available",
            "Review battery health — if capacity is below 80%, schedule replacement",
        ],
        severity=ErrorSeverity.WARNING,
        auto_recoverable=False,
        related_errors=["E-1001"],
        keywords=["battery", "low", "critical", "charge", "power", "dead"],
    ),
    ErrorCodeEntry(
        code="E-2001",
        vendor="Amazon Normal",
        models="All Amazon Normal AMRs",
        name="Obstacle Detected",
        description="The robot's LiDAR or proximity sensors detected an obstacle in its path. The robot has paused and is waiting for the obstacle to clear. It will automatically resume if the path clears within the timeout period.",
        common_causes=[
            "A physical object (box, pallet, equipment) is in the robot's path",
            "A person is standing in the robot's path",
            "Another robot is temporarily in the way",
            "Sensor malfunction — dirty or misaligned LiDAR",
        ],
        remediation_steps=[
            "Check the robot's immediate path for physical obstacles",
            "If a person is nearby, wait for them to move — robot will auto-resume",
            "If no visible obstacle, check if sensors need cleaning",
            "Robot will auto-resume after obstacle clears (timeout: 60 seconds)",
        ],
        severity=ErrorSeverity.WARNING,
        auto_recoverable=True,
        related_errors=["E-2002", "E-4012"],
        keywords=["obstacle", "blocked", "sensor", "lidar", "detected", "object"],
    ),
    ErrorCodeEntry(
        code="E-2002",
        vendor="Amazon Normal",
        models="All Amazon Normal AMRs",
        name="Obstacle Timeout",
        description="The robot detected an obstacle and waited for it to clear, but the obstacle remained for longer than the timeout period (60 seconds). The robot needs manual intervention.",
        common_causes=[
            "A permanent obstacle has been placed in the robot's path",
            "Another robot is stuck/idle in the path and won't move",
            "Construction or facility change has blocked a previously open path",
            "Sensor is malfunctioning and reporting phantom obstacles",
        ],
        remediation_steps=[
            "Physically inspect the robot's location for obstacles",
            "If another robot is blocking, assign it a task or send it to parking",
            "If path is permanently blocked, update the facility map",
            "If no obstacle is visible, schedule sensor inspection",
        ],
        severity=ErrorSeverity.WARNING,
        auto_recoverable=False,
        related_errors=["E-2001", "E-4012"],
        keywords=["obstacle", "timeout", "waiting", "stuck", "blocked"],
    ),
    ErrorCodeEntry(
        code="E-3001",
        vendor="Amazon Normal",
        models="All Amazon Normal AMRs",
        name="Localization Lost",
        description="The robot cannot determine its position on the facility map. It has lost its reference to known landmarks or map features. The robot has stopped and cannot navigate until localization is restored.",
        common_causes=[
            "Robot was manually moved while powered off",
            "Significant facility changes (new walls, removed shelves) that don't match the map",
            "LiDAR sensor obstruction (dust, tape, damage)",
            "Low battery causing sensor degradation",
        ],
        remediation_steps=[
            "Move the robot to a known location with clear line of sight to landmarks",
            "Run the relocalization procedure from the robot's control panel",
            "If facility has changed, update the map and redeploy to all robots",
            "Check LiDAR sensor for obstructions or damage",
        ],
        severity=ErrorSeverity.CRITICAL,
        auto_recoverable=False,
        related_errors=["E-3002"],
        keywords=["localization", "lost", "position", "navigation", "map", "location"],
    ),
    ErrorCodeEntry(
        code="E-3002",
        vendor="Amazon Normal",
        models="All Amazon Normal AMRs",
        name="Map Mismatch",
        description="The robot's sensors are detecting features that don't match the stored facility map. Navigation may be unreliable. The robot is proceeding with caution at reduced speed.",
        common_causes=[
            "Facility layout has changed since the last map update",
            "Temporary obstacles (stacked pallets, equipment) altering the environment",
            "Map was generated at a different time (e.g., empty warehouse vs. full)",
        ],
        remediation_steps=[
            "Compare the robot's sensor view with the stored map",
            "If facility has changed, schedule a map update",
            "If temporary, the robot may resolve this on its own",
            "Consider increasing map update frequency",
        ],
        severity=ErrorSeverity.WARNING,
        auto_recoverable=True,
        related_errors=["E-3001"],
        keywords=["map", "mismatch", "layout", "changed", "navigation"],
    ),
    ErrorCodeEntry(
        code="E-4010",
        vendor="Amazon Normal",
        models="All Amazon Normal AMRs",
        name="Path Computation Timeout",
        description="The robot's path planner took too long to compute a route and timed out. This usually happens when the destination is hard to reach due to complex obstacle layouts.",
        common_causes=[
            "Destination is in a complex area with many obstacles",
            "Multiple path options are being evaluated simultaneously",
            "Robot's processor is overloaded with other tasks",
            "Map complexity is too high for real-time path planning",
        ],
        remediation_steps=[
            "Retry the task — the path planner may succeed on a second attempt",
            "Simplify the route by using intermediate waypoints",
            "Check if the destination is actually reachable on the current map",
            "If persistent, consider upgrading the robot's compute module",
        ],
        severity=ErrorSeverity.WARNING,
        auto_recoverable=False,
        related_errors=["E-4012", "E-4015"],
        keywords=["path", "computation", "timeout", "route", "planning", "slow"],
    ),
    ErrorCodeEntry(
        code="E-4012",
        vendor="Amazon Normal",
        models="All Amazon Normal AMRs",
        name="Path Planning Failure",
        description="The robot tried to calculate a route to its destination but couldn't find a valid path. It has stopped and is waiting for the obstruction to clear or for manual help.",
        common_causes=[
            "Another robot is blocking the only available path",
            "A physical obstacle (box, pallet, person) is in the way",
            "The robot's map is outdated and shows a path that no longer exists",
            "Destination is unreachable (inside a blocked zone)",
        ],
        remediation_steps=[
            "Check the map to see if another robot is blocking — if yes, assign that robot a new task or move it",
            "If no robot is visible, physically inspect the location — remove any obstacles found",
            "If path looks clear, the map may need updating — contact supervisor to update facility map",
            "Try reassigning the task — robot will recompute path",
        ],
        severity=ErrorSeverity.WARNING,
        auto_recoverable=False,
        related_errors=["E-4010", "E-4015", "E-2001"],
        keywords=["path", "planning", "failure", "blocked", "route", "cannot move", "stuck"],
    ),
    ErrorCodeEntry(
        code="E-4015",
        vendor="Amazon Normal",
        models="All Amazon Normal AMRs",
        name="Destination Unreachable",
        description="The specified destination cannot be reached from the robot's current position. No valid path exists on the current map.",
        common_causes=[
            "Destination station is offline or has been removed",
            "Facility layout change has isolated the destination area",
            "Map hasn't been updated to reflect new routes",
            "Destination coordinates are outside the mapped area",
        ],
        remediation_steps=[
            "Verify the destination station exists and is accessible",
            "Check if there's been a facility layout change",
            "Cancel the task and assign an alternative destination",
            "Update the facility map if layout has changed",
        ],
        severity=ErrorSeverity.WARNING,
        auto_recoverable=False,
        related_errors=["E-4010", "E-4012"],
        keywords=["destination", "unreachable", "cannot reach", "no path"],
    ),
    ErrorCodeEntry(
        code="E-5001",
        vendor="Amazon Normal",
        models="All Amazon Normal AMRs",
        name="Motor Fault",
        description="One or more drive motors have reported a fault. The robot cannot move safely and has engaged its brakes. This requires physical inspection.",
        common_causes=[
            "Motor overheating due to sustained heavy loads",
            "Wheel jam — debris caught in wheel mechanism",
            "Motor driver electronics failure",
            "Wiring issue between motor and controller",
        ],
        remediation_steps=[
            "Do NOT attempt to push or move the robot manually",
            "Check for visible debris around the wheels",
            "Power cycle the robot (off for 30 seconds, then on)",
            "If error persists after power cycle, contact Amazon support",
        ],
        severity=ErrorSeverity.CRITICAL,
        auto_recoverable=False,
        related_errors=["E-5002", "E-1001"],
        keywords=["motor", "fault", "drive", "wheel", "cannot move", "hardware"],
    ),
    ErrorCodeEntry(
        code="E-5002",
        vendor="Amazon Normal",
        models="All Amazon Normal AMRs",
        name="Wheel Slip Detected",
        description="The robot's wheel encoders detected that the wheels are spinning but the robot isn't moving as expected. This usually indicates a slippery floor surface.",
        common_causes=[
            "Wet or oily floor surface",
            "Worn wheel treads",
            "Robot is trying to climb a slope that's too steep",
            "Heavy payload causing traction loss",
        ],
        remediation_steps=[
            "Check the floor surface for spills or moisture",
            "Inspect wheel treads for wear — replace if smooth",
            "Reduce payload if possible",
            "Robot may auto-recover once it reaches a dry surface",
        ],
        severity=ErrorSeverity.INFO,
        auto_recoverable=True,
        related_errors=["E-5001"],
        keywords=["wheel", "slip", "traction", "floor", "slippery"],
    ),
]

# --- Balyo Error Codes ---
BALYO_ERRORS: list[ErrorCodeEntry] = [
    ErrorCodeEntry(
        code="NAV_LOST",
        vendor="Balyo",
        models="All Balyo AGVs",
        name="Navigation Lost",
        description="The robot has lost its navigation reference and cannot determine its location or heading. It has stopped all motion and requires relocalization.",
        common_causes=[
            "Robot was manually repositioned while powered off",
            "Major facility change invalidated navigation landmarks",
            "Camera/sensor obstruction",
            "Low light conditions affecting visual navigation",
        ],
        remediation_steps=[
            "Move the robot to a well-lit area with clear navigation markers",
            "Run the relocalization procedure via the Balyo dashboard",
            "Check camera lenses for obstruction or damage",
            "If facility changed, update the navigation map",
        ],
        severity=ErrorSeverity.CRITICAL,
        auto_recoverable=False,
        related_errors=["PATH_BLOCKED", "OBSTACLE_TIMEOUT"],
        keywords=["navigation", "lost", "localization", "position"],
    ),
    ErrorCodeEntry(
        code="PATH_BLOCKED",
        vendor="Balyo",
        models="All Balyo AGVs",
        name="Path Blocked",
        description="The robot's planned path is blocked by an obstacle or another robot. It cannot proceed and is waiting for the blockage to clear.",
        common_causes=[
            "Another robot is stopped in the path",
            "Physical obstacle (box, equipment, person) in the way",
            "Narrow aisle with insufficient clearance",
            "Multiple robots converging on same corridor",
        ],
        remediation_steps=[
            "Check if another robot is blocking — move it if idle",
            "Physically inspect the blocked location",
            "Consider widening the path or adding alternate routes",
            "Reassign the task to reroute the robot",
        ],
        severity=ErrorSeverity.WARNING,
        auto_recoverable=True,
        related_errors=["NAV_LOST", "OBSTACLE_FRONT", "OBSTACLE_TIMEOUT"],
        keywords=["path", "blocked", "obstacle", "stuck", "cannot proceed"],
    ),
    ErrorCodeEntry(
        code="BATT_LOW",
        vendor="Balyo",
        models="All Balyo AGVs",
        name="Battery Low",
        description="The robot's battery is below 20%. It can still operate but should be sent to charge soon to avoid a critical shutdown.",
        common_causes=[
            "Robot has been operating for an extended period without charging",
            "Charging schedule wasn't followed",
            "Battery degradation over time",
        ],
        remediation_steps=[
            "Send the robot to the nearest available charging station after current task",
            "Monitor battery level — if it drops below 10%, send immediately",
            "Review charging schedules to prevent future occurrences",
        ],
        severity=ErrorSeverity.WARNING,
        auto_recoverable=False,
        related_errors=["BATT_CRITICAL"],
        keywords=["battery", "low", "charge", "power"],
    ),
    ErrorCodeEntry(
        code="BATT_CRITICAL",
        vendor="Balyo",
        models="All Balyo AGVs",
        name="Battery Critical",
        description="The robot's battery is below 5%. It has stopped all operations to preserve remaining power. It must be charged immediately to prevent deep discharge damage.",
        common_causes=[
            "Robot was not sent to charging despite BATT_LOW warning",
            "Charging station was unavailable when robot attempted to charge",
            "Battery has significant capacity degradation",
        ],
        remediation_steps=[
            "Immediately transport robot to nearest charging station",
            "Do not attempt to assign new tasks until battery > 20%",
            "Check battery health metrics — replace if capacity < 70%",
        ],
        severity=ErrorSeverity.CRITICAL,
        auto_recoverable=False,
        related_errors=["BATT_LOW"],
        keywords=["battery", "critical", "dead", "shutdown", "power"],
    ),
    ErrorCodeEntry(
        code="ESTOP",
        vendor="Balyo",
        models="All Balyo AGVs",
        name="Emergency Stop",
        description="Emergency stop has been activated on the robot. All motion is halted. Requires manual reset to resume operations.",
        common_causes=[
            "Physical e-stop button pressed by operator",
            "Safety system triggered due to proximity to person",
            "External safety controller sent stop signal",
        ],
        remediation_steps=[
            "Verify area around robot is safe",
            "Release the e-stop button (twist clockwise)",
            "Press the green reset button",
            "Robot will perform safety self-check before resuming",
        ],
        severity=ErrorSeverity.CRITICAL,
        auto_recoverable=False,
        related_errors=["MOTOR_FAULT"],
        keywords=["emergency", "stop", "e-stop", "safety", "halted"],
    ),
    ErrorCodeEntry(
        code="OBSTACLE_FRONT",
        vendor="Balyo",
        models="All Balyo AGVs",
        name="Front Obstacle",
        description="The robot's front sensors have detected an obstacle. The robot has slowed down or paused. This is an informational notice — the robot will typically navigate around the obstacle or wait for it to clear.",
        common_causes=[
            "Person walking in front of the robot",
            "Another robot briefly crossing the path",
            "Small object detected by low-level sensors",
        ],
        remediation_steps=[
            "No action usually required — robot will auto-handle",
            "If robot is stopped for more than 30 seconds, check the area",
            "Frequent triggers in the same area may indicate a permanent obstacle",
        ],
        severity=ErrorSeverity.INFO,
        auto_recoverable=True,
        related_errors=["PATH_BLOCKED", "OBSTACLE_TIMEOUT"],
        keywords=["obstacle", "front", "detected", "sensor"],
    ),
    ErrorCodeEntry(
        code="OBSTACLE_TIMEOUT",
        vendor="Balyo",
        models="All Balyo AGVs",
        name="Obstacle Timeout",
        description="The robot has been waiting for an obstacle to clear for more than 60 seconds. It requires manual intervention to proceed.",
        common_causes=[
            "Permanent obstacle in the path",
            "Another robot is stuck/idle and not moving",
            "Large item fell and is blocking the corridor",
        ],
        remediation_steps=[
            "Physically inspect the blocked location",
            "Remove the obstacle or reroute the robot",
            "If another robot is blocking, assign it a task or move it",
            "Update the map if the obstacle is permanent",
        ],
        severity=ErrorSeverity.WARNING,
        auto_recoverable=False,
        related_errors=["OBSTACLE_FRONT", "PATH_BLOCKED"],
        keywords=["obstacle", "timeout", "waiting", "stuck"],
    ),
    ErrorCodeEntry(
        code="MOTOR_FAULT",
        vendor="Balyo",
        models="All Balyo AGVs",
        name="Motor Error",
        description="A drive motor has reported an error. The robot cannot move safely. Physical inspection required.",
        common_causes=[
            "Motor overheating",
            "Debris caught in drive mechanism",
            "Motor controller failure",
            "Wiring fault",
        ],
        remediation_steps=[
            "Do not attempt to push the robot",
            "Check for visible debris around wheels and motors",
            "Power cycle the robot (wait 30 seconds between off and on)",
            "If error persists, contact Balyo support",
        ],
        severity=ErrorSeverity.CRITICAL,
        auto_recoverable=False,
        related_errors=["ESTOP"],
        keywords=["motor", "fault", "drive", "hardware", "broken"],
    ),
    ErrorCodeEntry(
        code="CHARGING_FAIL",
        vendor="Balyo",
        models="All Balyo AGVs",
        name="Charging Failed",
        description="The robot attempted to dock with a charging station but the connection failed. The robot is not charging.",
        common_causes=[
            "Misalignment with charging contacts",
            "Dirty charging contacts on robot or station",
            "Charging station malfunction",
            "Another robot is partially occupying the charging spot",
        ],
        remediation_steps=[
            "Manually reposition the robot on the charging pad",
            "Clean the charging contacts on both robot and station",
            "Try a different charging station",
            "If station appears faulty, take it offline and report for repair",
        ],
        severity=ErrorSeverity.WARNING,
        auto_recoverable=False,
        related_errors=["BATT_LOW", "BATT_CRITICAL"],
        keywords=["charging", "failed", "dock", "power", "station"],
    ),
    ErrorCodeEntry(
        code="TASK_TIMEOUT",
        vendor="Balyo",
        models="All Balyo AGVs",
        name="Task Timeout",
        description="The current task has exceeded its maximum allowed time. The robot may be stuck, lost, or repeatedly encountering obstacles.",
        common_causes=[
            "Robot is stuck in a loop (repeatedly trying and failing a path)",
            "Multiple obstacles causing repeated detours",
            "Task destination is effectively unreachable",
            "Robot speed reduced due to safety mode",
        ],
        remediation_steps=[
            "Check the robot's current position and status",
            "Cancel the current task and reassign it",
            "If the robot is stuck, manually intervene",
            "Review the route for recurring obstacles",
        ],
        severity=ErrorSeverity.WARNING,
        auto_recoverable=False,
        related_errors=["PATH_BLOCKED", "OBSTACLE_TIMEOUT"],
        keywords=["task", "timeout", "slow", "taking too long", "delayed"],
    ),
]

# --- Amazon Internal Error Codes ---
AMZN_ERRORS: list[ErrorCodeEntry] = [
    ErrorCodeEntry(
        code="0x0001",
        vendor="Amazon Internal",
        models="All Amazon Internal units",
        name="System Boot",
        description="The AGV has completed its boot sequence and is initializing systems. This is informational — the AGV will be ready for tasks in approximately 30 seconds.",
        common_causes=[
            "Normal power-on sequence",
            "Power cycle recovery",
            "Firmware update completed",
        ],
        remediation_steps=[
            "No action required — wait for boot to complete",
            "AGV will report 'ready' status when initialization is done",
        ],
        severity=ErrorSeverity.INFO,
        auto_recoverable=True,
        related_errors=[],
        keywords=["boot", "startup", "initialization", "power on"],
    ),
    ErrorCodeEntry(
        code="0x8001",
        vendor="Amazon Internal",
        models="All Amazon Internal units",
        name="E-Stop Pressed",
        description="The emergency stop button has been physically pressed on the AGV. All motors are locked. Manual reset required.",
        common_causes=[
            "Operator pressed e-stop for safety",
            "Accidental bump against e-stop button",
            "Safety procedure requires e-stop during maintenance",
        ],
        remediation_steps=[
            "Verify the area is safe",
            "Pull out and twist the e-stop button to release",
            "Press the green start button to resume",
            "AGV will run diagnostics before accepting new tasks",
        ],
        severity=ErrorSeverity.CRITICAL,
        auto_recoverable=False,
        related_errors=["0x800C"],
        keywords=["emergency", "stop", "e-stop", "button", "pressed"],
    ),
    ErrorCodeEntry(
        code="0x8004",
        vendor="Amazon Internal",
        models="All Amazon Internal units",
        name="Battery Low",
        description="AGV battery level is below 20%. The AGV should be directed to a charging station soon. It can continue operating but with reduced performance.",
        common_causes=[
            "Extended operation without charging",
            "Battery capacity degradation (common in legacy units)",
            "Higher-than-normal workload",
        ],
        remediation_steps=[
            "Direct the AGV to the nearest charging station after current task",
            "If battery drops below 10%, abort current task and charge immediately",
            "Schedule battery health check — legacy AGVs often have degraded cells",
        ],
        severity=ErrorSeverity.WARNING,
        auto_recoverable=False,
        related_errors=["0x8001"],
        keywords=["battery", "low", "charge", "power"],
    ),
    ErrorCodeEntry(
        code="0x8008",
        vendor="Amazon Internal",
        models="All Amazon Internal units",
        name="Path Error",
        description="The AGV's guidance system cannot follow the designated path. This typically means the guide wire or magnetic tape has been damaged or obscured.",
        common_causes=[
            "Guide wire/magnetic tape damaged or covered by debris",
            "Floor surface changed (new coating, repair)",
            "AGV's guidance sensors are dirty or misaligned",
            "Another AGV or obstacle is blocking the path",
        ],
        remediation_steps=[
            "Inspect the path at the AGV's current location",
            "Check for tape damage, debris, or obstructions on the floor",
            "Clean the AGV's guidance sensors (bottom-mounted)",
            "If tape is damaged, mark the area and schedule repair",
        ],
        severity=ErrorSeverity.WARNING,
        auto_recoverable=False,
        related_errors=["0x8018"],
        keywords=["path", "error", "guidance", "tape", "wire", "lost"],
    ),
    ErrorCodeEntry(
        code="0x800C",
        vendor="Amazon Internal",
        models="All Amazon Internal units",
        name="Motor Stall",
        description="One or more drive motors have stalled — the motor is receiving power but the wheels are not turning. The AGV has shut down motors to prevent damage.",
        common_causes=[
            "Wheel jammed by debris (shrink wrap, zip ties, cardboard)",
            "Motor bearing failure",
            "AGV is stuck against a wall or obstacle",
            "Overloaded — payload exceeds maximum weight",
        ],
        remediation_steps=[
            "Check wheels for jammed debris — remove carefully",
            "Check if AGV is pressed against any obstacle",
            "Verify payload weight does not exceed maximum (check AGV specs)",
            "If wheels are clear and not overloaded, the motor may need service",
            "Power cycle the AGV and test with no payload",
        ],
        severity=ErrorSeverity.CRITICAL,
        auto_recoverable=False,
        related_errors=["0x8001"],
        keywords=["motor", "stall", "stuck", "jammed", "wheel"],
    ),
    ErrorCodeEntry(
        code="0x8010",
        vendor="Amazon Internal",
        models="All Amazon Internal units",
        name="Sensor Fault",
        description="One or more sensors are reporting invalid data. The AGV may continue operating with reduced safety margins, or may stop depending on which sensor is affected.",
        common_causes=[
            "Sensor lens dirty or obscured",
            "Sensor wiring loose or damaged",
            "Sensor end-of-life (common in legacy units > 5 years old)",
            "Environmental interference (bright lights, reflective surfaces)",
        ],
        remediation_steps=[
            "Clean all sensor lenses and windows",
            "Check sensor connections and wiring",
            "If a specific sensor is identified, check its maintenance schedule",
            "Schedule a full sensor calibration during next maintenance window",
        ],
        severity=ErrorSeverity.WARNING,
        auto_recoverable=False,
        related_errors=["0x8018"],
        keywords=["sensor", "fault", "calibration", "dirty", "malfunction"],
    ),
    ErrorCodeEntry(
        code="0x8014",
        vendor="Amazon Internal",
        models="All Amazon Internal units",
        name="Communication Lost",
        description="The AGV has lost communication with the central control system. It will continue executing its current task but cannot receive new commands.",
        common_causes=[
            "WiFi signal loss in certain areas of the facility",
            "Central control system is down or restarting",
            "AGV's communication module malfunction",
            "Network congestion or interference",
        ],
        remediation_steps=[
            "Check if the central control system is online",
            "Verify WiFi coverage at the AGV's current location",
            "Restart the AGV's communication module (usually a separate power switch)",
            "If network is down, check with IT — all AGVs may be affected",
        ],
        severity=ErrorSeverity.CRITICAL,
        auto_recoverable=True,
        related_errors=[],
        keywords=["communication", "lost", "wifi", "network", "disconnected", "offline"],
    ),
    ErrorCodeEntry(
        code="0x8018",
        vendor="Amazon Internal",
        models="All Amazon Internal units",
        name="Guidance Lost",
        description="The AGV has completely lost its guidance reference (wire or tape). It has stopped and cannot navigate until guidance is restored.",
        common_causes=[
            "End of guide wire/tape reached unexpectedly",
            "Large section of guidance tape removed or damaged",
            "AGV was manually moved off the guided path",
            "Guidance sensor complete failure",
        ],
        remediation_steps=[
            "Manually push the AGV back onto the guided path",
            "Inspect the guidance tape/wire in the area for damage",
            "Run the AGV's guidance sensor test procedure",
            "If tape is missing, replace the section before resuming",
        ],
        severity=ErrorSeverity.CRITICAL,
        auto_recoverable=False,
        related_errors=["0x8008", "0x8010"],
        keywords=["guidance", "lost", "tape", "wire", "off path"],
    ),
    ErrorCodeEntry(
        code="ERR_47",
        vendor="Amazon Internal",
        models="All Amazon Internal units",
        name="Undefined Error",
        description="An unspecified error has occurred in the AGV's control system. This is a catch-all error code that may require deeper investigation.",
        common_causes=[
            "Software bug in the AGV's firmware",
            "Combination of minor issues triggering a general fault",
            "Memory overflow in the AGV's controller (common in older units)",
            "Intermittent hardware issue",
        ],
        remediation_steps=[
            "Power cycle the AGV (off for 60 seconds, then on)",
            "If error recurs, note the circumstances (what the AGV was doing)",
            "Check if multiple AGVs have the same error (suggests system-wide issue)",
            "Contact the AGV vendor with the error log for analysis",
        ],
        severity=ErrorSeverity.WARNING,
        auto_recoverable=False,
        related_errors=[],
        keywords=["undefined", "unknown", "general", "unspecified"],
    ),
]

# --- Combined Knowledge Base ---
ALL_ERRORS: list[ErrorCodeEntry] = AR_ERRORS + BALYO_ERRORS + AMZN_ERRORS

# Index by code for fast lookup
ERROR_BY_CODE: dict[str, ErrorCodeEntry] = {e.code: e for e in ALL_ERRORS}

# Cross-vendor mapping (similar error types across vendors)
CROSS_VENDOR_MAP = {
    "path_blocked": ["E-4012", "PATH_BLOCKED", "0x8008"],
    "emergency_stop": ["E-1001", "ESTOP", "0x8001"],
    "battery_critical": ["E-1005", "BATT_CRITICAL", "0x8004"],
    "motor_fault": ["E-5001", "MOTOR_FAULT", "0x800C"],
    "navigation_lost": ["E-3001", "NAV_LOST", "0x8018"],
    "obstacle": ["E-2001", "OBSTACLE_FRONT", "0x8010"],
    "obstacle_timeout": ["E-2002", "OBSTACLE_TIMEOUT", "0x8008"],
}


def lookup_error(code: str) -> ErrorCodeEntry | None:
    """Look up an error code by exact match."""
    return ERROR_BY_CODE.get(code)


def search_errors(query: str) -> list[ErrorCodeEntry]:
    """Search error codes by partial code match, keyword, vendor, or description."""
    query_lower = query.lower()
    results = []
    for entry in ALL_ERRORS:
        # Check code match
        if query_lower in entry.code.lower():
            results.append(entry)
            continue
        # Check name match
        if query_lower in entry.name.lower():
            results.append(entry)
            continue
        # Check vendor match
        if query_lower in entry.vendor.lower():
            results.append(entry)
            continue
        # Check keyword match
        if any(query_lower in kw for kw in entry.keywords):
            results.append(entry)
            continue
        # Check description match
        if query_lower in entry.description.lower():
            results.append(entry)
            continue
    return results


def get_errors_by_vendor(vendor: str) -> list[ErrorCodeEntry]:
    """Get all error codes for a specific vendor."""
    return [e for e in ALL_ERRORS if e.vendor == vendor]


def get_errors_by_severity(severity: ErrorSeverity) -> list[ErrorCodeEntry]:
    """Get all error codes of a specific severity level."""
    return [e for e in ALL_ERRORS if e.severity == severity]


def get_equivalent_errors(code: str) -> list[ErrorCodeEntry]:
    """Find equivalent error codes from other vendors."""
    for _category, codes in CROSS_VENDOR_MAP.items():
        if code in codes:
            return [ERROR_BY_CODE[c] for c in codes if c != code and c in ERROR_BY_CODE]
    return []

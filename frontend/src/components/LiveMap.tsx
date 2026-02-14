import { useRef, useEffect, useCallback, useState, useMemo } from 'react';
import { useFleet } from '../context/FleetContext';
import { STATUS_COLORS, ZONE_COLORS, ZONE_BORDER_COLORS, VENDOR_INFO } from '../lib/colors';
import type { Robot, Position } from '../types/robot';

const CELL = 22;
const PAD = 40;
const MAX_TRAILS = 3; // selected + 2 nearest

/* ---- helpers (pure, zero-alloc where possible) ---- */

function robotR(z: number) { return z < 0.6 ? 8 : z < 1.0 ? 12 : z < 1.5 ? 18 : 24; }

// Pre-compute rgba strings per status (avoids parseInt every frame)
const GLOW_CACHE: Record<string, Record<number, string>> = {};
function rgba(hex: string, a: number): string {
  const key = `${hex}_${(a * 100) | 0}`;
  if (GLOW_CACHE[hex]?.[key as unknown as number]) return GLOW_CACHE[hex][key as unknown as number];
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const s = `rgba(${r},${g},${b},${a})`;
  if (!GLOW_CACHE[hex]) GLOW_CACHE[hex] = {};
  (GLOW_CACHE[hex] as Record<string, string>)[key] = s;
  return s;
}

function g2c(x: number, y: number, z: number, ox: number, oy: number) {
  return { cx: PAD + x * CELL * z + ox, cy: PAD + y * CELL * z + oy };
}
function c2g(cx: number, cy: number, z: number, ox: number, oy: number) {
  return { x: (cx - PAD - ox) / (CELL * z), y: (cy - PAD - oy) / (CELL * z) };
}

/* Pick IDs of robots that should show trails: selected + 2 nearest to viewport center */
function pickTrailIds(
  robots: Robot[],
  selectedId: string | null,
  viewCenterX: number,
  viewCenterY: number,
): Set<string> {
  const ids = new Set<string>();
  if (selectedId) ids.add(selectedId);

  // Sort by distance to view center, pick nearest active/moving ones
  const scored = robots
    .filter(r => r.trail.length > 1 && r.id !== selectedId)
    .map(r => ({
      id: r.id,
      d: (r.position.x - viewCenterX) ** 2 + (r.position.y - viewCenterY) ** 2,
    }))
    .sort((a, b) => a.d - b.d);

  for (const s of scored) {
    if (ids.size >= MAX_TRAILS) break;
    ids.add(s.id);
  }
  return ids;
}

/* ============================================================ */

export default function LiveMap() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const { state, dispatch } = useFleet();

  // --- Refs that the draw loop reads (no dependency array churn) ---
  const stateRef = useRef(state);
  stateRef.current = state;

  const [hoveredRobot, setHoveredRobot] = useState<string | null>(null);
  const hoveredRef = useRef(hoveredRobot);
  hoveredRef.current = hoveredRobot;

  const [legendCollapsed, setLegendCollapsed] = useState(false);

  const prevPos = useRef<Map<string, Position>>(new Map());
  const lerpPos = useRef<Map<string, Position>>(new Map());
  const lastTick = useRef(Date.now());
  const animFrame = useRef(0);
  const sizeRef = useRef({ w: 0, h: 0 });

  // Panning
  const panning = useRef(false);
  const panStart = useRef({ x: 0, y: 0 });
  const panOffsetSnap = useRef({ x: 0, y: 0 });

  // Status counts (rendered in legend overlay, not in draw loop)
  const statusCounts = useMemo(() => {
    const c = { active: 0, idle: 0, error: 0, charging: 0, offline: 0 };
    state.robots.forEach(r => { c[r.status]++; });
    return c;
  }, [state.robots]);

  /* ---- Sync lerp targets when robots update ---- */
  useEffect(() => {
    for (const robot of state.robots) {
      const cur = lerpPos.current.get(robot.id);
      if (cur) prevPos.current.set(robot.id, { ...cur });
      lerpPos.current.set(robot.id, { x: robot.position.x, y: robot.position.y });
      if (!prevPos.current.has(robot.id))
        prevPos.current.set(robot.id, { x: robot.position.x, y: robot.position.y });
    }
    lastTick.current = Date.now();
  }, [state.robots]);

  /* ---- ResizeObserver — only recalc canvas size when container resizes ---- */
  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;
    const ro = new ResizeObserver(entries => {
      const cr = entries[0].contentRect;
      const dpr = window.devicePixelRatio || 1;
      sizeRef.current = { w: cr.width, h: cr.height };
      canvas.width = cr.width * dpr;
      canvas.height = cr.height * dpr;
      canvas.style.width = `${cr.width}px`;
      canvas.style.height = `${cr.height}px`;
    });
    ro.observe(container);
    return () => ro.disconnect();
  }, []);

  /* ================================================================
     DRAW — runs every rAF, reads stateRef (no React deps, never recreated)
     ================================================================ */
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) { animFrame.current = requestAnimationFrame(draw); return; }
    const ctx = canvas.getContext('2d');
    if (!ctx) { animFrame.current = requestAnimationFrame(draw); return; }

    const { w, h } = sizeRef.current;
    if (w === 0) { animFrame.current = requestAnimationFrame(draw); return; }

    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const S = stateRef.current;
    const hovered = hoveredRef.current;
    const zoom = S.mapZoom;
    const ox = S.mapOffset.x;
    const oy = S.mapOffset.y;

    // --- Background ---
    ctx.fillStyle = '#0a0a0f';
    ctx.fillRect(0, 0, w, h);

    const fac = S.facility;
    if (!fac) {
      ctx.fillStyle = '#606070';
      ctx.font = '14px Inter, system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Initializing...', w / 2, h / 2);
      ctx.textAlign = 'left';
      animFrame.current = requestAnimationFrame(draw);
      return;
    }

    // --- Zones ---
    for (const [name, b] of Object.entries(fac.zones)) {
      const tl = g2c(b.x_min, b.y_min, zoom, ox, oy);
      const br = g2c(b.x_max + 1, b.y_max + 1, zoom, ox, oy);
      const zw = br.cx - tl.cx;
      const zh = br.cy - tl.cy;
      ctx.fillStyle = ZONE_COLORS[name] || 'rgba(255,255,255,0.02)';
      ctx.fillRect(tl.cx, tl.cy, zw, zh);
      ctx.setLineDash([8, 4]);
      ctx.strokeStyle = ZONE_BORDER_COLORS[name] || 'rgba(255,255,255,0.08)';
      ctx.lineWidth = 1;
      ctx.strokeRect(tl.cx, tl.cy, zw, zh);
      ctx.setLineDash([]);
      if (S.showZoneLabels && zoom > 0.5) {
        ctx.fillStyle = 'rgba(255,255,255,0.18)';
        ctx.font = `600 ${11 * Math.max(zoom, 0.8)}px Inter, system-ui, sans-serif`;
        ctx.fillText(name.toUpperCase(), tl.cx + 8 * zoom, tl.cy + 16 * zoom);
      }
    }

    // --- Grid ---
    if (S.showGrid) {
      ctx.strokeStyle = 'rgba(0,212,255,0.04)';
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      for (let x = 0; x <= fac.grid_width; x++) {
        const p = g2c(x, 0, zoom, ox, oy);
        const p2 = g2c(x, fac.grid_height, zoom, ox, oy);
        ctx.moveTo(p.cx, p.cy); ctx.lineTo(p2.cx, p2.cy);
      }
      for (let y = 0; y <= fac.grid_height; y++) {
        const p = g2c(0, y, zoom, ox, oy);
        const p2 = g2c(fac.grid_width, y, zoom, ox, oy);
        ctx.moveTo(p.cx, p.cy); ctx.lineTo(p2.cx, p2.cy);
      }
      ctx.stroke(); // single stroke call for entire grid
    }

    // --- Stations (no shadowBlur — double-stroke for fake glow) ---
    for (const [name, pos] of Object.entries(fac.stations)) {
      const { cx, cy } = g2c(pos.x, pos.y, zoom, ox, oy);
      const sz = 6 * zoom;
      // Fake glow: wider, semi-transparent stroke
      ctx.strokeStyle = 'rgba(0,212,255,0.15)';
      ctx.lineWidth = 4;
      ctx.strokeRect(cx - sz, cy - sz, sz * 2, sz * 2);
      // Main stroke
      ctx.strokeStyle = 'rgba(0,212,255,0.5)';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(cx - sz, cy - sz, sz * 2, sz * 2);
      ctx.fillStyle = 'rgba(0,212,255,0.05)';
      ctx.fillRect(cx - sz, cy - sz, sz * 2, sz * 2);
      if (zoom > 0.7) {
        ctx.fillStyle = 'rgba(0,212,255,0.4)';
        ctx.font = `500 ${8 * Math.max(zoom, 0.8)}px Inter, system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillText(name.replace('Station ', 'S'), cx, cy + sz + 12 * zoom);
        ctx.textAlign = 'left';
      }
    }

    // --- Charging Stations (no shadowBlur) ---
    for (const [, pos] of Object.entries(fac.charging_stations)) {
      const { cx, cy } = g2c(pos.x, pos.y, zoom, ox, oy);
      const rr = 5 * zoom;
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = (Math.PI / 3) * i - Math.PI / 6;
        const hx = cx + rr * Math.cos(a), hy = cy + rr * Math.sin(a);
        i === 0 ? ctx.moveTo(hx, hy) : ctx.lineTo(hx, hy);
      }
      ctx.closePath();
      ctx.fillStyle = 'rgba(0,212,255,0.08)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,212,255,0.35)';
      ctx.lineWidth = 1;
      ctx.stroke();
      if (zoom > 0.8) {
        ctx.fillStyle = 'rgba(0,212,255,0.5)';
        ctx.font = `${8 * zoom}px Inter, system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillText('⚡', cx, cy + 3);
        ctx.textAlign = 'left';
      }
    }

    // --- Interpolation (smooth easing) ---
    const elapsed = Date.now() - lastTick.current;
    const tRaw = Math.min(elapsed / 550, 1);
    // Smoothstep easing for fluid movement
    const t = tRaw * tRaw * (3 - 2 * tRaw);
    const now = Date.now();

    // --- Active alerts (cache once) ---
    const activeAlerts = S.alerts.filter(a => !a.resolved);

    // --- Conflicts (no shadowBlur) ---
    for (const alert of activeAlerts) {
      if (alert.alert_type === 'deadlock' && alert.affected_robots.length >= 2) {
        const r1 = S.robots.find(r => r.id === alert.affected_robots[0]);
        const r2 = S.robots.find(r => r.id === alert.affected_robots[1]);
        if (r1 && r2) {
          const p1 = g2c(r1.position.x, r1.position.y, zoom, ox, oy);
          const p2 = g2c(r2.position.x, r2.position.y, zoom, ox, oy);
          const mx = (p1.cx + p2.cx) / 2, my = (p1.cy + p2.cy) / 2;
          ctx.setLineDash([6, 4]);
          ctx.strokeStyle = '#ff3b3b';
          ctx.lineWidth = 2;
          ctx.beginPath(); ctx.moveTo(p1.cx, p1.cy); ctx.lineTo(p2.cx, p2.cy); ctx.stroke();
          ctx.setLineDash([]);
          const pulse = 0.7 + 0.3 * Math.sin(now / 300);
          const xs = 8 * zoom * pulse;
          ctx.beginPath();
          ctx.moveTo(mx - xs, my - xs); ctx.lineTo(mx + xs, my + xs);
          ctx.moveTo(mx + xs, my - xs); ctx.lineTo(mx - xs, my + xs);
          ctx.strokeStyle = '#ff3b3b';
          ctx.lineWidth = 3;
          ctx.stroke();
        }
      }
      if (alert.alert_type === 'congestion' && alert.position) {
        const { cx, cy } = g2c(alert.position.x, alert.position.y, zoom, ox, oy);
        const cr = 35 * zoom;
        const phase = (now % 3000) / 3000;
        ctx.beginPath();
        ctx.arc(cx, cy, cr * (0.8 + 0.2 * phase), 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255,184,0,${0.06 * (1 - phase)})`;
        ctx.fill();
        ctx.strokeStyle = `rgba(255,184,0,${0.25 * (1 - phase * 0.5)})`;
        ctx.lineWidth = 1.5;
        ctx.setLineDash([4, 4]); ctx.stroke(); ctx.setLineDash([]);
      }
    }

    // --- Charge path (red dotted line from robot to charger) ---
    if (S.chargePath) {
      const cp = S.chargePath;
      const cpRobot = S.robots.find(r => r.id === cp.robotId);
      if (cpRobot) {
        const fromP = g2c(cpRobot.position.x, cpRobot.position.y, zoom, ox, oy);
        const toP = g2c(cp.to.x, cp.to.y, zoom, ox, oy);
        const dashOff = (now / 40) % 24;

        // Marching ants red dotted line
        ctx.setLineDash([10, 6]);
        ctx.lineDashOffset = -dashOff;
        ctx.strokeStyle = '#ff3b3b';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(fromP.cx, fromP.cy);
        ctx.lineTo(toP.cx, toP.cy);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.lineDashOffset = 0;

        // Glow behind the line
        ctx.strokeStyle = 'rgba(255,59,59,0.15)';
        ctx.lineWidth = 8;
        ctx.beginPath();
        ctx.moveTo(fromP.cx, fromP.cy);
        ctx.lineTo(toP.cx, toP.cy);
        ctx.stroke();

        // Pulsing target circle at charger
        const pulse = 0.6 + 0.4 * Math.sin(now / 350);
        ctx.beginPath(); ctx.arc(toP.cx, toP.cy, (10 + 4 * pulse) * zoom, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(255,59,59,${0.4 + 0.3 * pulse})`;
        ctx.lineWidth = 2;
        ctx.stroke();

        // Charger label
        ctx.fillStyle = '#ff3b3b';
        ctx.font = `bold ${9 * Math.max(zoom, 0.8)}px Inter, system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillText(cp.chargerName, toP.cx, toP.cy - (14 + 4 * pulse) * zoom);
        ctx.fillStyle = 'rgba(255,59,59,0.6)';
        ctx.font = `${7 * Math.max(zoom, 0.8)}px Inter, system-ui, sans-serif`;
        ctx.fillText('CHARGING TARGET', toP.cx, toP.cy + (14 + 4 * pulse) * zoom);
        ctx.textAlign = 'left';

        // Auto-clear when robot arrives at charger (distance < 2)
        const dx = cpRobot.position.x - cp.to.x;
        const dy = cpRobot.position.y - cp.to.y;
        if (dx * dx + dy * dy < 4) {
          // Will be cleared by React effect
        }
      }
    }

    // --- Decide which robots get trails ---
    const viewCenter = c2g(w / 2, h / 2, zoom, ox, oy);
    const trailIds = pickTrailIds(S.robots, S.selectedRobotId, viewCenter.x, viewCenter.y);

    // --- ROBOTS ---
    for (const robot of S.robots) {
      const prev = prevPos.current.get(robot.id) || robot.position;
      const tgt = lerpPos.current.get(robot.id) || robot.position;
      const lx = prev.x + (tgt.x - prev.x) * t;
      const ly = prev.y + (tgt.y - prev.y) * t;
      const { cx, cy } = g2c(lx, ly, zoom, ox, oy);

      // Skip if off-screen (with margin)
      if (cx < -60 || cx > w + 60 || cy < -60 || cy > h + 60) continue;

      const r = robotR(zoom);
      const sel = S.selectedRobotId === robot.id;
      const hov = hovered === robot.id;
      const col = STATUS_COLORS[robot.status];
      const hasAlert = activeAlerts.some(a => a.affected_robots.includes(robot.id));

      // --- Trail (only for closest 3, NO shadowBlur) ---
      if (trailIds.has(robot.id) && robot.trail.length > 1) {
        ctx.lineWidth = 2 * zoom;
        ctx.lineCap = 'round';
        for (let i = 1; i < robot.trail.length; i++) {
          const a = (i / robot.trail.length) * 0.35;
          const tp1 = g2c(robot.trail[i - 1].x, robot.trail[i - 1].y, zoom, ox, oy);
          const tp2 = g2c(robot.trail[i].x, robot.trail[i].y, zoom, ox, oy);
          ctx.beginPath();
          ctx.moveTo(tp1.cx, tp1.cy);
          ctx.lineTo(tp2.cx, tp2.cy);
          ctx.strokeStyle = rgba(col, a);
          ctx.stroke();
        }
        ctx.lineCap = 'butt';
      }

      // --- Outer glow (cheap: extra circle fill, no shadow) ---
      if (robot.status === 'active' || robot.status === 'error' || hasAlert) {
        const phase = (now % 2000) / 2000;
        const gr = r + 6 + 4 * Math.sin(phase * Math.PI * 2);
        const ga = 0.12 + 0.08 * Math.sin(phase * Math.PI * 2);
        ctx.beginPath(); ctx.arc(cx, cy, gr, 0, Math.PI * 2);
        ctx.fillStyle = rgba(col, ga);
        ctx.fill();
      }

      // Alert ping ring
      if (hasAlert) {
        const phase = (now % 1500) / 1500;
        ctx.beginPath();
        ctx.arc(cx, cy, r + 12 * phase * zoom, 0, Math.PI * 2);
        ctx.strokeStyle = rgba(robot.status === 'error' ? '#ff3b3b' : '#ffb800', 0.5 * (1 - phase));
        ctx.lineWidth = 2;
        ctx.stroke();
      }

      // Selection ring
      if (sel) {
        ctx.beginPath(); ctx.arc(cx, cy, r + 5, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(255,255,255,0.5)';
        ctx.lineWidth = 2;
        ctx.stroke();
        // Fake white glow ring
        ctx.beginPath(); ctx.arc(cx, cy, r + 8, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(255,255,255,0.1)';
        ctx.lineWidth = 4;
        ctx.stroke();
      }

      // --- Robot body (NO shadowBlur anywhere) ---
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2);

      if (robot.status === 'offline') {
        ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.stroke();
        const xs = r * 0.4;
        ctx.beginPath();
        ctx.moveTo(cx - xs, cy - xs); ctx.lineTo(cx + xs, cy + xs);
        ctx.moveTo(cx + xs, cy - xs); ctx.lineTo(cx - xs, cy + xs);
        ctx.strokeStyle = col; ctx.lineWidth = 1.5; ctx.stroke();
      } else if (robot.status === 'idle') {
        ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.stroke();
        ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fillStyle = rgba(col, 0.15); ctx.fill();
      } else if (robot.status === 'charging') {
        const breathe = 0.5 + 0.5 * Math.sin(now / 600);
        ctx.fillStyle = rgba(col, 0.3 + 0.3 * breathe); ctx.fill();
        ctx.strokeStyle = rgba(col, 0.6 + 0.3 * breathe);
        ctx.lineWidth = 2; ctx.stroke();
        // Fake glow ring
        ctx.beginPath(); ctx.arc(cx, cy, r + 4, 0, Math.PI * 2);
        ctx.strokeStyle = rgba(col, 0.1 + 0.1 * breathe);
        ctx.lineWidth = 5; ctx.stroke();
      } else {
        // Active / error — solid with fake glow
        ctx.fillStyle = col;
        ctx.globalAlpha = hov || sel ? 1 : 0.85;
        ctx.fill();
        ctx.globalAlpha = 1;
        // Fake glow: larger circle at low alpha
        ctx.beginPath(); ctx.arc(cx, cy, r + 5, 0, Math.PI * 2);
        ctx.fillStyle = rgba(col, 0.12);
        ctx.fill();
        // Inner ring
        ctx.beginPath(); ctx.arc(cx, cy, r - 2, 0, Math.PI * 2);
        ctx.strokeStyle = rgba(col, 0.3); ctx.lineWidth = 1; ctx.stroke();
      }

      // --- Direction nose ---
      if (robot.speed > 0) {
        const hr = (robot.heading * Math.PI) / 180;
        const nLen = r + 6 * zoom;
        const nW = r * 0.35;
        const nx = cx + Math.cos(hr) * nLen;
        const ny = cy + Math.sin(hr) * nLen;
        const la = hr + Math.PI / 2, ra = hr - Math.PI / 2;
        ctx.beginPath();
        ctx.moveTo(nx, ny);
        ctx.lineTo(cx + Math.cos(la) * nW + Math.cos(hr) * r * 0.6,
                    cy + Math.sin(la) * nW + Math.sin(hr) * r * 0.6);
        ctx.lineTo(cx + Math.cos(ra) * nW + Math.cos(hr) * r * 0.6,
                    cy + Math.sin(ra) * nW + Math.sin(hr) * r * 0.6);
        ctx.closePath();
        ctx.fillStyle = robot.status === 'idle' ? col : '#ffffff';
        ctx.globalAlpha = 0.9;
        ctx.fill();
        ctx.globalAlpha = 1;
      }

      // --- ID label ---
      if (zoom > 0.8 || sel || hov) {
        ctx.fillStyle = sel || hov ? '#ffffff' : 'rgba(255,255,255,0.55)';
        ctx.font = `${sel ? '700' : '500'} ${10 * Math.max(zoom, 0.8)}px Inter, system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillText(robot.id, cx, cy - r - 6 * zoom);
        ctx.textAlign = 'left';
      }

      // Vendor at close zoom
      if (zoom > 1.2) {
        ctx.fillStyle = 'rgba(255,255,255,0.35)';
        ctx.font = `500 ${7 * zoom}px Inter, system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillText(
          VENDOR_INFO[robot.vendor]?.short || robot.vendor,
          cx, cy + r + 14 * zoom
        );
        ctx.textAlign = 'left';
      }
    }

    // --- Hover tooltip ---
    if (hovered) {
      const robot = S.robots.find(r => r.id === hovered);
      if (robot) {
        const prev = prevPos.current.get(robot.id) || robot.position;
        const tgt = lerpPos.current.get(robot.id) || robot.position;
        const lx2 = prev.x + (tgt.x - prev.x) * t;
        const ly2 = prev.y + (tgt.y - prev.y) * t;
        const { cx: tcx, cy: tcy } = g2c(lx2, ly2, zoom, ox, oy);
        const col = STATUS_COLORS[robot.status];

        const ttX = tcx + 18 * zoom, ttY = tcy - 35 * zoom;
        const tw = 195, th = 70, rr = 8;

        // Background (no shadow)
        ctx.fillStyle = 'rgba(18,18,26,0.92)';
        ctx.strokeStyle = rgba(col, 0.3);
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(ttX + rr, ttY);
        ctx.lineTo(ttX + tw - rr, ttY);
        ctx.quadraticCurveTo(ttX + tw, ttY, ttX + tw, ttY + rr);
        ctx.lineTo(ttX + tw, ttY + th - rr);
        ctx.quadraticCurveTo(ttX + tw, ttY + th, ttX + tw - rr, ttY + th);
        ctx.lineTo(ttX + rr, ttY + th);
        ctx.quadraticCurveTo(ttX, ttY + th, ttX, ttY + th - rr);
        ctx.lineTo(ttX, ttY + rr);
        ctx.quadraticCurveTo(ttX, ttY, ttX + rr, ttY);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // Status dot (no shadow, just a bright fill)
        ctx.beginPath(); ctx.arc(ttX + 12, ttY + 16, 4, 0, Math.PI * 2);
        ctx.fillStyle = col; ctx.fill();

        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 11px Inter, system-ui, sans-serif';
        ctx.fillText(robot.id, ttX + 22, ttY + 19);
        ctx.fillStyle = '#606070';
        ctx.font = '10px Inter, system-ui, sans-serif';
        ctx.fillText(robot.vendor, ttX + 22 + ctx.measureText(robot.id).width + 8, ttY + 19);

        ctx.fillStyle = '#a0a0b0';
        ctx.fillText('Status: ', ttX + 10, ttY + 38);
        ctx.fillStyle = col;
        ctx.fillText(robot.status.toUpperCase(), ttX + 52, ttY + 38);
        ctx.fillStyle = '#606070';
        ctx.fillText('  │  Battery: ', ttX + 52 + ctx.measureText(robot.status.toUpperCase()).width, ttY + 38);
        ctx.fillStyle = robot.battery > 50 ? '#00ff88' : robot.battery > 20 ? '#ffb800' : '#ff3b3b';
        ctx.fillText(`${robot.battery.toFixed(0)}%`, ttX + 145, ttY + 38);
        ctx.fillStyle = '#606070';
        ctx.fillText(`Zone: ${robot.zone}  │  Speed: ${robot.speed.toFixed(1)} m/s`, ttX + 10, ttY + 56);
      }
    }

    // --- Minimap (no shadow) ---
    if (fac) {
      const mmW = 120, mmH = 85;
      const mmX = w - mmW - 14, mmY = h - mmH - 14;
      const mmS = Math.min(mmW / fac.grid_width, mmH / fac.grid_height);
      ctx.fillStyle = 'rgba(10,10,15,0.85)';
      ctx.strokeStyle = 'rgba(255,255,255,0.08)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(mmX + 6, mmY);
      ctx.lineTo(mmX + mmW - 6, mmY);
      ctx.quadraticCurveTo(mmX + mmW, mmY, mmX + mmW, mmY + 6);
      ctx.lineTo(mmX + mmW, mmY + mmH - 6);
      ctx.quadraticCurveTo(mmX + mmW, mmY + mmH, mmX + mmW - 6, mmY + mmH);
      ctx.lineTo(mmX + 6, mmY + mmH);
      ctx.quadraticCurveTo(mmX, mmY + mmH, mmX, mmY + mmH - 6);
      ctx.lineTo(mmX, mmY + 6);
      ctx.quadraticCurveTo(mmX, mmY, mmX + 6, mmY);
      ctx.closePath();
      ctx.fill(); ctx.stroke();

      for (const robot of S.robots) {
        const rx = mmX + robot.position.x * mmS;
        const ry = mmY + robot.position.y * mmS;
        ctx.beginPath(); ctx.arc(rx, ry, 2.5, 0, Math.PI * 2);
        ctx.fillStyle = STATUS_COLORS[robot.status];
        ctx.fill();
      }
    }

    animFrame.current = requestAnimationFrame(draw);
  }, []); // ← ZERO deps — reads refs only

  /* Start / stop the animation loop */
  useEffect(() => {
    animFrame.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(animFrame.current);
  }, [draw]);

  /* ========= MOUSE (throttled via rAF to avoid jank) ========= */
  const mousePending = useRef(false);
  const lastMouse = useRef({ x: 0, y: 0 });

  const processMouseMove = useCallback(() => {
    mousePending.current = false;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const S = stateRef.current;
    const { x: mx, y: my } = lastMouse.current;
    const gp = c2g(mx, my, S.mapZoom, S.mapOffset.x, S.mapOffset.y);
    let found: string | null = null;
    for (const robot of S.robots) {
      const dx = robot.position.x - gp.x;
      const dy = robot.position.y - gp.y;
      if (dx * dx + dy * dy < (1.5 / S.mapZoom) ** 2) { found = robot.id; break; }
    }
    setHoveredRobot(found);
    canvas.style.cursor = found ? 'pointer' : panning.current ? 'grabbing' : 'default';
  }, []);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (panning.current) {
      const dx = e.clientX - panStart.current.x;
      const dy = e.clientY - panStart.current.y;
      dispatch({ type: 'SET_MAP_OFFSET', offset: {
        x: panOffsetSnap.current.x + dx,
        y: panOffsetSnap.current.y + dy,
      }});
      return;
    }
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    lastMouse.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    if (!mousePending.current) {
      mousePending.current = true;
      requestAnimationFrame(processMouseMove);
    }
  }, [dispatch, processMouseMove]);

  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (e.button === 0 && !hoveredRef.current) {
      panning.current = true;
      panStart.current = { x: e.clientX, y: e.clientY };
      panOffsetSnap.current = { ...stateRef.current.mapOffset };
      if (canvasRef.current) canvasRef.current.style.cursor = 'grabbing';
    }
  }, []);

  const handleMouseUp = useCallback(() => {
    panning.current = false;
    if (canvasRef.current) canvasRef.current.style.cursor = 'default';
  }, []);

  const handleClick = useCallback(() => {
    if (panning.current) return;
    dispatch({ type: 'SELECT_ROBOT', robotId: hoveredRef.current || null });
  }, [dispatch]);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.03 : 0.03;
    const cur = stateRef.current.mapZoom;
    dispatch({ type: 'SET_MAP_ZOOM', zoom: Math.max(0.3, Math.min(3, cur + delta)) });
  }, [dispatch]);

  const glowClasses: Record<string, string> = {
    active: 'glow-green-sm', idle: 'glow-amber-sm', error: 'glow-red-sm',
    charging: 'glow-blue-sm', offline: 'glow-purple-sm',
  };

  return (
    <div ref={containerRef} className="w-full h-full relative bg-[#0a0a0f]">
      <canvas
        ref={canvasRef}
        onMouseMove={handleMouseMove}
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onClick={handleClick}
        onWheel={handleWheel}
        className="w-full h-full"
      />

      {/* Map Controls */}
      <div className="absolute bottom-5 left-5 flex flex-col gap-1.5">
        <button
          onClick={() => dispatch({ type: 'SET_MAP_ZOOM', zoom: Math.min(3, stateRef.current.mapZoom + 0.2) })}
          className="w-9 h-9 bg-[#12121a]/90 border border-white/[0.08] rounded-lg text-white hover:bg-[#1a1a25] hover:border-white/[0.15] flex items-center justify-center text-sm font-medium transition-all duration-200"
        >+</button>
        <button
          onClick={() => dispatch({ type: 'SET_MAP_ZOOM', zoom: Math.max(0.3, stateRef.current.mapZoom - 0.2) })}
          className="w-9 h-9 bg-[#12121a]/90 border border-white/[0.08] rounded-lg text-white hover:bg-[#1a1a25] hover:border-white/[0.15] flex items-center justify-center text-sm font-medium transition-all duration-200"
        >−</button>
        <div className="h-px bg-white/[0.06] mx-1" />
        <button
          onClick={() => { dispatch({ type: 'SET_MAP_ZOOM', zoom: 1 }); dispatch({ type: 'SET_MAP_OFFSET', offset: { x: 0, y: 0 } }); }}
          className="w-9 h-9 bg-[#12121a]/90 border border-white/[0.08] rounded-lg text-[#a0a0b0] hover:text-white hover:bg-[#1a1a25] hover:border-white/[0.15] flex items-center justify-center text-xs transition-all duration-200"
          title="Reset view"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></svg>
        </button>
      </div>

      {/* Legend */}
      <div className="absolute top-4 right-4 glass rounded-xl min-w-[170px] overflow-hidden">
        <button
          onClick={() => setLegendCollapsed(!legendCollapsed)}
          className="w-full flex items-center justify-between px-4 py-2.5 text-[10px] text-[#a0a0b0] hover:text-white transition-colors"
        >
          <span className="font-semibold tracking-[0.15em] uppercase">Legend</span>
          <span className="text-xs">{legendCollapsed ? '+' : '−'}</span>
        </button>
        {!legendCollapsed && (
          <div className="px-4 pb-3 space-y-2 border-t border-white/[0.06] pt-2.5">
            {(['active', 'idle', 'error', 'charging', 'offline'] as const).map(status => (
              <div key={status} className="flex items-center justify-between">
                <span className="flex items-center gap-2.5">
                  <span className={`w-2.5 h-2.5 rounded-full ${glowClasses[status]}`}
                        style={{ backgroundColor: STATUS_COLORS[status] }} />
                  <span className="text-[#a0a0b0] text-xs capitalize">{status}</span>
                </span>
                <span className="text-white font-semibold tabular-nums text-xs"
                      style={{ textShadow: statusCounts[status] > 0 ? `0 0 8px ${STATUS_COLORS[status]}40` : 'none' }}>
                  {statusCounts[status]}
                </span>
              </div>
            ))}
            <div className="pt-1.5 border-t border-white/[0.06] text-[11px] text-[#606070]">
              Total: <span className="text-white">{state.robots.length}</span> robots
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

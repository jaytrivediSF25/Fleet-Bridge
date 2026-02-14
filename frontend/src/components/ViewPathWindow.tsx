import { useRef, useEffect, useCallback } from 'react';
import { useFleet } from '../context/FleetContext';
import { STATUS_COLORS } from '../lib/colors';

const PAD = 20;

export default function ViewPathWindow() {
  const { state, dispatch } = useFleet();
  const robotId = state.viewPathRobotId;
  const robot = state.robots.find(r => r.id === robotId);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef(0);

  const close = () => dispatch({ type: 'SET_VIEW_PATH_ROBOT', robotId: null });

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !robot || !state.facility) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const W = canvas.width;
    const H = canvas.height;
    const fac = state.facility;
    const scaleX = (W - PAD * 2) / fac.grid_width;
    const scaleY = (H - PAD * 2) / fac.grid_height;
    const s = Math.min(scaleX, scaleY);
    const ox = (W - fac.grid_width * s) / 2;
    const oy = (H - fac.grid_height * s) / 2;

    const g2c = (x: number, y: number) => ({ cx: ox + x * s, cy: oy + y * s });
    const col = STATUS_COLORS[robot.status];
    const now = Date.now();

    // Background
    ctx.fillStyle = '#0a0a0f';
    ctx.fillRect(0, 0, W, H);

    // Grid
    ctx.strokeStyle = 'rgba(0,212,255,0.06)';
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    for (let x = 0; x <= fac.grid_width; x += 5) {
      const p = g2c(x, 0), p2 = g2c(x, fac.grid_height);
      ctx.moveTo(p.cx, p.cy); ctx.lineTo(p2.cx, p2.cy);
    }
    for (let y = 0; y <= fac.grid_height; y += 5) {
      const p = g2c(0, y), p2 = g2c(fac.grid_width, y);
      ctx.moveTo(p.cx, p.cy); ctx.lineTo(p2.cx, p2.cy);
    }
    ctx.stroke();

    // Zones (subtle)
    for (const [name, b] of Object.entries(fac.zones)) {
      const tl = g2c(b.x_min, b.y_min);
      const br = g2c(b.x_max + 1, b.y_max + 1);
      ctx.fillStyle = 'rgba(255,255,255,0.02)';
      ctx.fillRect(tl.cx, tl.cy, br.cx - tl.cx, br.cy - tl.cy);
      ctx.strokeStyle = 'rgba(255,255,255,0.06)';
      ctx.lineWidth = 0.5;
      ctx.setLineDash([4, 4]);
      ctx.strokeRect(tl.cx, tl.cy, br.cx - tl.cx, br.cy - tl.cy);
      ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(255,255,255,0.12)';
      ctx.font = '8px Inter, system-ui';
      ctx.fillText(name, tl.cx + 3, tl.cy + 10);
    }

    // Stations (small dots)
    for (const [name, pos] of Object.entries(fac.stations)) {
      const { cx, cy } = g2c(pos.x, pos.y);
      ctx.beginPath(); ctx.arc(cx, cy, 3, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(0,212,255,0.2)';
      ctx.fill();
      ctx.fillStyle = 'rgba(0,212,255,0.35)';
      ctx.font = '6px Inter, system-ui';
      ctx.textAlign = 'center';
      ctx.fillText(name.replace('Station ', 'S'), cx, cy + 8);
      ctx.textAlign = 'left';
    }

    // Charging stations
    for (const [, pos] of Object.entries(fac.charging_stations)) {
      const { cx, cy } = g2c(pos.x, pos.y);
      ctx.beginPath(); ctx.arc(cx, cy, 3, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(0,212,255,0.4)';
      ctx.fill();
      ctx.fillStyle = 'rgba(0,212,255,0.6)';
      ctx.font = '7px Inter';
      ctx.textAlign = 'center';
      ctx.fillText('⚡', cx, cy + 1);
      ctx.textAlign = 'left';
    }

    // Trail (full trail, fading opacity)
    if (robot.trail.length > 1) {
      for (let i = 1; i < robot.trail.length; i++) {
        const a = (i / robot.trail.length) * 0.6;
        const p1 = g2c(robot.trail[i - 1].x, robot.trail[i - 1].y);
        const p2 = g2c(robot.trail[i].x, robot.trail[i].y);
        ctx.beginPath();
        ctx.moveTo(p1.cx, p1.cy);
        ctx.lineTo(p2.cx, p2.cy);
        ctx.strokeStyle = `rgba(255,255,255,${a})`;
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    }

    // Path to destination (if has task)
    if (robot.current_task) {
      const destStation = fac.stations[robot.current_task.to_station];
      if (destStation) {
        const rp = g2c(robot.position.x, robot.position.y);
        const dp = g2c(destStation.x, destStation.y);

        // Animated dashed line
        const dashOffset = (now / 50) % 20;
        ctx.setLineDash([8, 6]);
        ctx.lineDashOffset = -dashOffset;
        ctx.strokeStyle = robot.current_task.task_type === 'charging' ? '#ff3b3b' : '#00d4ff';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(rp.cx, rp.cy);
        ctx.lineTo(dp.cx, dp.cy);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.lineDashOffset = 0;

        // Destination marker (pulsing)
        const pulse = 0.7 + 0.3 * Math.sin(now / 400);
        ctx.beginPath(); ctx.arc(dp.cx, dp.cy, 6 * pulse, 0, Math.PI * 2);
        ctx.strokeStyle = robot.current_task.task_type === 'charging' ? '#ff3b3b' : '#00d4ff';
        ctx.lineWidth = 2;
        ctx.stroke();

        // Destination label
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 8px Inter, system-ui';
        ctx.textAlign = 'center';
        ctx.fillText(robot.current_task.to_station, dp.cx, dp.cy - 10);
        ctx.textAlign = 'left';
      }

      // Origin
      const fromStation = fac.stations[robot.current_task.from_station];
      if (fromStation) {
        const fp = g2c(fromStation.x, fromStation.y);
        ctx.beginPath(); ctx.arc(fp.cx, fp.cy, 4, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(255,184,0,0.5)';
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.fillStyle = 'rgba(255,184,0,0.7)';
        ctx.font = '7px Inter, system-ui';
        ctx.textAlign = 'center';
        ctx.fillText('FROM', fp.cx, fp.cy - 7);
        ctx.textAlign = 'left';
      }
    }

    // Robot position (glowing dot)
    const rp = g2c(robot.position.x, robot.position.y);
    // Outer glow
    const breathe = 0.5 + 0.5 * Math.sin(now / 500);
    ctx.beginPath(); ctx.arc(rp.cx, rp.cy, 10, 0, Math.PI * 2);
    // Convert hex to rgba for glow
    const hexToRgba = (hex: string, alpha: number) => {
      const r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16);
      return `rgba(${r},${g},${b},${alpha})`;
    };
    ctx.fillStyle = hexToRgba(col, 0.15 + 0.1 * breathe);
    ctx.fill();
    // Body
    ctx.beginPath(); ctx.arc(rp.cx, rp.cy, 6, 0, Math.PI * 2);
    ctx.fillStyle = col;
    ctx.fill();
    // Direction
    if (robot.speed > 0) {
      const hr = (robot.heading * Math.PI) / 180;
      const nx = rp.cx + Math.cos(hr) * 12;
      const ny = rp.cy + Math.sin(hr) * 12;
      ctx.beginPath();
      ctx.moveTo(nx, ny);
      ctx.lineTo(rp.cx + Math.cos(hr + 2.5) * 4, rp.cy + Math.sin(hr + 2.5) * 4);
      ctx.lineTo(rp.cx + Math.cos(hr - 2.5) * 4, rp.cy + Math.sin(hr - 2.5) * 4);
      ctx.closePath();
      ctx.fillStyle = '#ffffff';
      ctx.fill();
    }
    // Label
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 9px Inter, system-ui';
    ctx.textAlign = 'center';
    ctx.fillText(robot.id, rp.cx, rp.cy - 12);
    ctx.textAlign = 'left';

    animRef.current = requestAnimationFrame(draw);
  }, [robot, state.facility]);

  useEffect(() => {
    if (!robotId) return;
    animRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(animRef.current);
  }, [robotId, draw]);

  if (!robotId || !robot) return null;

  return (
    <div className="fixed bottom-20 left-5 z-[80] animate-scale-pop"
         style={{ boxShadow: '0 0 40px rgba(0,0,0,0.5), 0 0 15px rgba(0,212,255,0.1)' }}>
      <div className="w-[360px] h-[260px] bg-[#12121a] border border-white/[0.1] rounded-xl overflow-hidden">
        {/* Header */}
        <div className="h-9 flex items-center justify-between px-4 bg-[#0a0a0f]/80 border-b border-white/[0.06]">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full"
                  style={{ backgroundColor: STATUS_COLORS[robot.status], boxShadow: `0 0 6px ${STATUS_COLORS[robot.status]}` }} />
            <span className="text-[10px] font-semibold text-white tracking-wide">{robot.id} — Path View</span>
          </div>
          <button onClick={close} className="text-[#606070] hover:text-white transition-colors text-sm leading-none">×</button>
        </div>
        {/* Canvas */}
        <canvas ref={canvasRef} width={360} height={232} className="w-full h-[232px]" />
      </div>
    </div>
  );
}

import type { RobotStatus, AlertSeverity } from '../types/robot';

/* ============================================================
   FleetBridge — Industrial Cyberpunk Colour System
   Every status colour has a matching glow.
   ============================================================ */

export const STATUS_COLORS: Record<RobotStatus, string> = {
  active:   '#00ff88',
  idle:     '#ffb800',
  error:    '#ff3b3b',
  charging: '#3b82f6',  // Blue when charging
  offline:  '#8b5cf6',
};

export const STATUS_GLOW: Record<RobotStatus, string> = {
  active:   '0 0 20px rgba(0,255,136,0.4)',
  idle:     '0 0 20px rgba(255,184,0,0.35)',
  error:    '0 0 20px rgba(255,59,59,0.45)',
  charging: '0 0 20px rgba(59,130,246,0.4)',  // Blue glow
  offline:  '0 0 15px rgba(139,92,246,0.3)',
};

export const STATUS_GLOW_CSS: Record<RobotStatus, string> = {
  active:   'glow-green',
  idle:     'glow-amber',
  error:    'glow-red',
  charging: 'glow-blue',
  offline:  'glow-purple',
};

export const STATUS_TEXT_GLOW: Record<RobotStatus, string> = {
  active:   'text-glow-green',
  idle:     'text-glow-amber',
  error:    'text-glow-red',
  charging: 'text-glow-blue',
  offline:  'text-glow-purple',
};

export const STATUS_LABELS: Record<RobotStatus, string> = {
  active:   'ACTIVE',
  idle:     'IDLE',
  error:    'ERROR',
  charging: 'CHARGING',
  offline:  'OFFLINE',
};

export const STATUS_ICONS: Record<RobotStatus, string> = {
  active:   '\u25CF',
  idle:     '\u25CF',
  error:    '\u25CF',
  charging: '\u25CF',
  offline:  '\u25CB',
};

export const SEVERITY_COLORS: Record<AlertSeverity, string> = {
  critical: '#ff3b3b',
  warning:  '#ffb800',
  info:     '#00d4ff',
  resolved: '#00ff88',
};

export const SEVERITY_GLOW: Record<AlertSeverity, string> = {
  critical: 'glow-red',
  warning:  'glow-amber',
  info:     'glow-cyan',
  resolved: 'glow-green',
};

export const SEVERITY_LABELS: Record<AlertSeverity, string> = {
  critical: 'CRITICAL',
  warning:  'WARNING',
  info:     'INFO',
  resolved: 'RESOLVED',
};

export const VENDOR_COLORS: Record<string, string> = {
  'Amazon Normal':    '#00d4ff',
  'Balyo':            '#00ff88',
  'Amazon Internal':  '#ffb800',
};

export const VENDOR_INFO: Record<string, { label: string; short: string; color: string; desc: string }> = {
  'Amazon Normal':   { label: 'Amazon Normal',   short: 'AR',   color: '#00d4ff', desc: 'Cyan — Proteus AMR' },
  'Balyo':           { label: 'Balyo',           short: 'BALYO', color: '#00ff88', desc: 'Green — B-Matic AMR' },
  'Amazon Internal': { label: 'Amazon Internal', short: 'AMZN', color: '#ffb800', desc: 'Amber — Custom AGV-X' },
};

/* Zone colours — semi-transparent with colour hints */
export const ZONE_COLORS: Record<string, string> = {
  'Zone A': 'rgba(0,212,255,0.04)',
  'Zone B': 'rgba(0,255,136,0.04)',
  'Zone C': 'rgba(255,184,0,0.04)',
  'Zone D': 'rgba(139,92,246,0.04)',
  'Zone E': 'rgba(0,212,255,0.03)',
  'Zone F': 'rgba(0,255,136,0.03)',
};

export const ZONE_BORDER_COLORS: Record<string, string> = {
  'Zone A': 'rgba(0,212,255,0.15)',
  'Zone B': 'rgba(0,255,136,0.15)',
  'Zone C': 'rgba(255,184,0,0.15)',
  'Zone D': 'rgba(139,92,246,0.15)',
  'Zone E': 'rgba(0,212,255,0.10)',
  'Zone F': 'rgba(0,255,136,0.10)',
};

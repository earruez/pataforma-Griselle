// ─────────────────────────────────────────────────────────────────────────────
//  Ficha de Control de Aeronave
//  /aircraft/:id
//  Counters (TSN / Ciclos / CdN) · Semáforo de Vencimientos · Historial reciente
// ─────────────────────────────────────────────────────────────────────────────

import { useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowLeft, Plane, Clock, AlertTriangle, CheckCircle2,
  FileText, Paperclip, ClipboardList, Activity,
  Calendar, Gauge, RotateCcw, Zap, ExternalLink,
} from 'lucide-react';
import { aircraftApi, type Aircraft } from '@api/aircraft.api';
import { maintenancePlanApi, type MaintenancePlanItem } from '@api/maintenancePlan.api';
import { AircraftStatusReport } from '@components/reports/AircraftStatusReport';
import { useState } from 'react';
import { useWorkRequestStore } from '../store/workRequestStore';
import { createSTFromSource } from '../shared/createSTFromSource';
import {
  findActiveWorkRequestByMaintenanceTaskId,
  getVisibleSTStatus,
  WORK_REQUEST_VISIBLE_STATUS_LABELS,
  type WorkRequest,
} from '../shared/workRequestTypes';

// ─── Constants ────────────────────────────────────────────────────────────────
const DAILY_HOURS = 2;
const MS_PER_DAY  = 86_400_000;

type AlertTier = 'overdue' | 'critical' | 'warning' | 'ok';

const STATUS_LABEL: Record<string, string> = {
  OPERATIONAL:    'Operacional',
  AOG:            'AOG',
  IN_MAINTENANCE: 'En Mantenimiento',
  GROUNDED:       'En Tierra',
  DECOMMISSIONED: 'Retirada',
};

const STATUS_CLASSES: Record<string, string> = {
  OPERATIONAL:    'bg-emerald-100 text-emerald-800 border-emerald-200',
  AOG:            'bg-rose-100 text-rose-800 border-rose-200',
  IN_MAINTENANCE: 'bg-amber-100 text-amber-800 border-amber-200',
  GROUNDED:       'bg-orange-100 text-orange-800 border-orange-200',
  DECOMMISSIONED: 'bg-slate-100 text-slate-600 border-slate-200',
};

// ─── Semaphore helpers ────────────────────────────────────────────────────────
function getAlertTier(item: MaintenancePlanItem): AlertTier {
  if (item.status === 'OVERDUE') return 'overdue';
  const h = item.hoursRemaining;
  const d = item.daysRemaining;
  if ((h != null && h < 5) || (d != null && d < 5))   return 'critical';
  if ((h != null && h < 15) || (d != null && d < 15))  return 'warning';
  return 'ok';
}

function tierColor(tier: AlertTier) {
  return {
    overdue:  { row: 'bg-rose-50',   badge: 'bg-rose-100 text-rose-700',   dot: 'bg-rose-500',   ring: '#ef4444' },
    critical: { row: 'bg-red-50',    badge: 'bg-red-100 text-red-700',     dot: 'bg-red-500',    ring: '#f87171' },
    warning:  { row: 'bg-amber-50',  badge: 'bg-amber-100 text-amber-700', dot: 'bg-amber-400',  ring: '#f59e0b' },
    ok:       { row: '',             badge: 'bg-emerald-100 text-emerald-700', dot: 'bg-emerald-400', ring: '#10b981' },
  }[tier];
}

// ─── Circular progress ring ───────────────────────────────────────────────────
const RADIUS       = 38;
const STROKE_WIDTH = 8;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
const VIEW_SIZE     = (RADIUS + STROKE_WIDTH) * 2 + 4;

function ProgressRing({
  pct, value, unit, label, tier, sublabel,
}: {
  pct: number;
  value: string;
  unit: string;
  label: string;
  tier: AlertTier;
  sublabel?: string;
}) {
  const clamped  = Math.max(0, Math.min(100, pct));
  const offset   = CIRCUMFERENCE * (1 - clamped / 100);
  const ringColor = tierColor(tier).ring;
  const center   = VIEW_SIZE / 2;

  return (
    <div className="flex flex-col items-center gap-1 select-none">
      <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">{label}</p>
      <div className="relative" style={{ width: VIEW_SIZE, height: VIEW_SIZE }}>
        <svg
          width={VIEW_SIZE}
          height={VIEW_SIZE}
          style={{ transform: 'rotate(-90deg)' }}
        >
          {/* Track */}
          <circle
            r={RADIUS} cx={center} cy={center}
            fill="none" stroke="#e2e8f0" strokeWidth={STROKE_WIDTH}
          />
          {/* Progress arc */}
          <circle
            r={RADIUS} cx={center} cy={center}
            fill="none"
            stroke={ringColor}
            strokeWidth={STROKE_WIDTH}
            strokeDasharray={`${CIRCUMFERENCE} ${CIRCUMFERENCE}`}
            strokeDashoffset={offset}
            strokeLinecap="round"
            style={{ transition: 'stroke-dashoffset 0.7s ease' }}
          />
        </svg>
        {/* Center label (no rotation correction: rotate the wrapper back) */}
        <div
          className="absolute inset-0 flex flex-col items-center justify-center"
          style={{ transform: 'none' }}
        >
          <span className="text-lg font-extrabold tabular-nums text-slate-900 leading-none">
            {value}
          </span>
          <span className="text-[10px] text-slate-400 mt-0.5">{unit}</span>
        </div>
      </div>
      {sublabel && (
        <span className="text-[10px] text-slate-400">{sublabel}</span>
      )}
    </div>
  );
}

// ─── Static icon counter card (for items without a ring) ─────────────────────
function StatCard({
  Icon, label, value, sub, colorClass,
}: {
  Icon: React.ElementType;
  label: string;
  value: string;
  sub?: string;
  colorClass: string;
}) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 flex items-center gap-4">
      <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${colorClass}`}>
        <Icon size={20} />
      </div>
      <div className="min-w-0">
        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{label}</p>
        <p className="text-2xl font-extrabold tabular-nums text-slate-900 leading-none mt-0.5">{value}</p>
        {sub && <p className="text-xs text-slate-400 mt-0.5 truncate">{sub}</p>}
      </div>
    </div>
  );
}

// ─── Semaphore dot pill ───────────────────────────────────────────────────────
function TierBadge({ tier }: { tier: AlertTier }) {
  const labels = { overdue: 'Vencida', critical: 'Crítica', warning: 'Próxima', ok: 'Al día' };
  const { badge } = tierColor(tier);
  return (
    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${badge}`}>
      {labels[tier]}
    </span>
  );
}

type TaskSTInfo = {
  label: 'Sin ST' | 'Borrador' | 'En proceso' | 'Cerrada';
  workRequestId: string | null;
  hasST: boolean;
  isOpen: boolean;
};

function resolveTaskSTInfo(
  item: MaintenancePlanItem,
  workRequests: WorkRequest[],
  aircraftId: string,
): TaskSTInfo {
  const active = findActiveWorkRequestByMaintenanceTaskId({
    workRequests,
    aircraftId,
    maintenanceTaskId: item.taskId,
  });

  const byId = item.inWorkRequestId
    ? workRequests.find((wr) => wr.id === item.inWorkRequestId)
    : undefined;

  const byTask = workRequests
    .filter((wr) => wr.items.some((it) => it.sourceId === item.taskId))
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())[0];

  const wr = active ?? byId ?? byTask;

  if (!wr) {
    if (item.inWorkRequestId || item.inWorkRequestNumber) {
      return { label: 'En proceso', workRequestId: item.inWorkRequestId ?? null, hasST: true, isOpen: true };
    }
    return { label: 'Sin ST', workRequestId: null, hasST: false, isOpen: false };
  }

  const visible = getVisibleSTStatus(wr.status);
  const label = WORK_REQUEST_VISIBLE_STATUS_LABELS[visible] as TaskSTInfo['label'];
  return {
    label,
    workRequestId: wr.id,
    hasST: true,
    isOpen: visible !== 'cerrada',
  };
}

// ─── Semaphore table ──────────────────────────────────────────────────────────
function SemaphoreTable({
  plan,
  aircraftId,
  workRequests,
  viewDensity,
  onOpenST,
  onGenerateST,
}: {
  plan: MaintenancePlanItem[];
  aircraftId: string;
  workRequests: WorkRequest[];
  viewDensity: 'comfortable' | 'compact';
  onOpenST: (workRequestId: string | null, taskCode: string) => void;
  onGenerateST: (task: MaintenancePlanItem) => void;
}) {
  const sorted = useMemo(() => {
    return [...plan]
      .filter(i => i.hoursRemaining != null || i.daysRemaining != null || i.status === 'OVERDUE')
      .map(i => {
        const hoursAsDays = i.hoursRemaining != null ? i.hoursRemaining / DAILY_HOURS : Infinity;
        const calDays     = i.daysRemaining  != null ? i.daysRemaining                : Infinity;
        const stInfo = resolveTaskSTInfo(i, workRequests, aircraftId);
        const isOverdueWithoutST = i.status === 'OVERDUE' && !stInfo.hasST;
        return {
          ...i,
          stInfo,
          urgencyDays: Math.min(hoursAsDays, calDays),
          sortBucket: isOverdueWithoutST ? 0 : 1,
        };
      })
      .sort((a, b) => {
        if (a.sortBucket !== b.sortBucket) return a.sortBucket - b.sortBucket;
        return a.urgencyDays - b.urgencyDays;
      })
      .slice(0, 10);
  }, [plan, workRequests, aircraftId]);

  if (sorted.length === 0) {
    return (
      <div className="py-8 text-center text-xs text-slate-400 flex items-center justify-center gap-2">
        <CheckCircle2 size={14} className="text-emerald-400" />
        Sin tareas con vencimiento registrado.
      </div>
    );
  }

  const cellPadding = viewDensity === 'compact' ? 'px-3 py-2' : 'px-4 py-2.5';
  const headerPadding = viewDensity === 'compact' ? 'px-3 py-2' : 'px-4 py-2.5';
  const tinyText = viewDensity === 'compact' ? 'text-[9px]' : 'text-[10px]';
  const actionGap = viewDensity === 'compact' ? 'space-y-0.5' : 'space-y-1';
  const actionButtonPadding = viewDensity === 'compact' ? 'px-1.5 py-0.5' : 'px-2 py-0.5';

  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200">
      <table className="min-w-full text-xs divide-y divide-slate-100">
        <thead className="bg-slate-50">
          <tr>
            <th className={`${headerPadding} text-left font-bold text-slate-500 uppercase tracking-wide ${tinyText}`}>ATA · Tarea</th>
            <th className={`${headerPadding} text-right font-bold text-slate-500 uppercase tracking-wide ${tinyText}`}>H restantes</th>
            <th className={`${headerPadding} text-right font-bold text-slate-500 uppercase tracking-wide ${tinyText}`}>Días cal.</th>
            <th className={`${headerPadding} text-right font-bold text-slate-500 uppercase tracking-wide ${tinyText}`}>Próx. fecha</th>
            <th className={`${headerPadding} text-center font-bold text-slate-500 uppercase tracking-wide ${tinyText}`}>Sustento</th>
            <th className={`${headerPadding} text-center font-bold text-slate-500 uppercase tracking-wide ${tinyText}`}>Estado</th>
            <th className={`${headerPadding} text-center font-bold text-slate-500 uppercase tracking-wide ${tinyText}`}>ST</th>
            <th className={`${headerPadding} text-center font-bold text-slate-500 uppercase tracking-wide ${tinyText}`}>Acción</th>
            <th className={`${headerPadding} text-center font-bold text-slate-500 uppercase tracking-wide ${tinyText}`}>Evidencia</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 bg-white">
          {sorted.map(item => {
            const stInfo = item.stInfo;
            const tier = getAlertTier(item);
            const { row, dot } = tierColor(tier);
            const highlightNoST = item.status === 'OVERDUE' && !stInfo.hasST;
            const hoursAsDays = item.hoursRemaining != null ? item.hoursRemaining / DAILY_HOURS : Infinity;
            const calDays     = item.daysRemaining  != null ? item.daysRemaining                : Infinity;
            const drivingDate = item.hoursRemaining != null && hoursAsDays <= calDays
              ? new Date(Date.now() + hoursAsDays * MS_PER_DAY)
              : item.nextDueDate
                ? new Date(item.nextDueDate)
                : item.daysRemaining != null
                  ? new Date(Date.now() + item.daysRemaining * MS_PER_DAY)
                  : null;
            return (
              <tr key={item.taskId} className={`${row} ${highlightNoST ? 'ring-1 ring-inset ring-rose-200 bg-rose-50/70' : ''}`}>
                <td className={cellPadding}>
                  <div className={`flex items-start ${viewDensity === 'compact' ? 'gap-1.5' : 'gap-2'}`}>
                    <span className={`mt-0.5 w-2 h-2 rounded-full shrink-0 ${dot} ${tier !== 'ok' ? 'animate-pulse' : ''}`} />
                    <div>
                      <span className="font-mono font-bold text-slate-500 text-[10px] bg-slate-100 px-1 py-0.5 rounded mr-1">
                        {item.taskCode}
                      </span>
                      <span className="text-slate-700">{item.taskTitle}</span>
                    </div>
                  </div>
                </td>
                <td className={`${cellPadding} text-right font-bold tabular-nums ${
                  (tier === 'overdue' || tier === 'critical') ? 'text-rose-600' :
                  tier === 'warning' ? 'text-amber-600' : 'text-slate-600'
                }`}>
                  {item.hoursRemaining != null
                    ? item.hoursRemaining < 0
                      ? <span className="text-rose-600">+{Math.abs(item.hoursRemaining).toFixed(0)}h venc.</span>
                      : `${item.hoursRemaining.toFixed(1)} h`
                    : <span className="text-slate-300">—</span>}
                </td>
                <td className={`${cellPadding} text-right font-semibold tabular-nums ${
                  (tier === 'overdue' || tier === 'critical') ? 'text-rose-600' :
                  tier === 'warning' ? 'text-amber-600' : 'text-slate-600'
                }`}>
                  {item.daysRemaining != null
                    ? item.daysRemaining < 0
                      ? <span className="text-rose-600">+{Math.abs(item.daysRemaining)}d venc.</span>
                      : `${item.daysRemaining}d`
                    : <span className="text-slate-300">—</span>}
                </td>
                <td className={`${cellPadding} text-right text-slate-500 text-[11px] tabular-nums`}>
                  {drivingDate ? drivingDate.toLocaleDateString('es-MX') : <span className="text-slate-300">—</span>}
                </td>
                <td className={`${cellPadding} text-center`}>
                  <span className="text-[10px] font-semibold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded-full">
                    {item.legalSource}
                  </span>
                </td>
                <td className={`${cellPadding} text-center`}>
                  <TierBadge tier={tier} />
                </td>
                <td className={`${cellPadding} text-center`}>
                  <span
                    className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                      stInfo.label === 'Sin ST'
                        ? 'bg-slate-100 text-slate-500'
                        : stInfo.label === 'Borrador'
                          ? 'bg-slate-200 text-slate-700'
                          : stInfo.label === 'En proceso'
                              ? 'bg-amber-100 text-amber-700'
                              : 'bg-emerald-100 text-emerald-700'
                    }`}
                  >
                    {stInfo.label}
                  </span>
                </td>
                <td className={`${cellPadding} text-center`}>
                  {stInfo.hasST ? (
                    <div className={actionGap}>
                      <button
                        onClick={() => onOpenST(stInfo.workRequestId, item.taskCode)}
                        className={`inline-flex items-center gap-1 text-[10px] font-semibold text-brand-700 bg-brand-50 hover:bg-brand-100 ${actionButtonPadding} rounded-full`}
                      >
                        Ver ST
                      </button>
                      {stInfo.isOpen && <p className="text-[10px] text-amber-700">ST existente</p>}
                    </div>
                  ) : (
                    <div className={actionGap}>
                      <button
                        onClick={() => onGenerateST(item)}
                        className={`inline-flex items-center gap-1 text-[10px] font-semibold text-white bg-brand-600 hover:bg-brand-700 ${actionButtonPadding} rounded-full`}
                      >
                        Agregar a ST
                      </button>
                      {highlightNoST && <p className="text-[10px] text-rose-700">Pendiente de solicitud</p>}
                    </div>
                  )}
                </td>
                <td className={`${cellPadding} text-center`}>
                  {item.lastEvidenceUrl ? (
                    <button
                      onClick={() => window.open(item.lastEvidenceUrl!, '_blank')}
                      className="inline-flex items-center gap-1 text-brand-600 hover:text-brand-700 text-[11px] font-medium
                                 bg-brand-50 hover:bg-brand-100 px-2 py-0.5 rounded-full transition-colors"
                      title="Ver evidencia OT"
                    >
                      <Paperclip size={10} />
                      Ver OT
                    </button>
                  ) : (
                    <span className="text-slate-300 text-[10px]">—</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─── Audit history timeline ───────────────────────────────────────────────────
function AuditTimeline({ aircraftId }: { aircraftId: string }) {
  const { data: entries = [], isLoading } = useQuery({
    queryKey: ['aircraft-audit', aircraftId],
    queryFn: () => aircraftApi.getAuditLog(aircraftId),
    staleTime: 60_000,
  });

  const last5 = useMemo(() => [...entries]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 5),
  [entries]);

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 py-6 text-xs text-slate-400">
        <Activity size={13} className="animate-pulse" /> Cargando historial…
      </div>
    );
  }

  if (last5.length === 0) {
    return (
      <div className="py-6 text-center text-xs text-slate-400">
        Sin registros de bitácora para esta aeronave.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {last5.map((entry, i) => {
        const meta  = entry.metadata as Record<string, string> | null;
        const evidenceUrl = meta?.evidenceUrl ?? meta?.evidence_url ?? null;
        const isLast = i === last5.length - 1;

        return (
          <div key={entry.id} className="flex gap-3">
            {/* Timeline spine */}
            <div className="flex flex-col items-center shrink-0">
              <div className={`w-2.5 h-2.5 rounded-full mt-0.5 ${
                entry.action.includes('CLOSE') || entry.action.includes('COMPLY')
                  ? 'bg-emerald-500'
                  : entry.action.includes('DELETE') || entry.action.includes('CANCEL')
                    ? 'bg-rose-400'
                    : 'bg-brand-400'
              }`} />
              {!isLast && <div className="w-[1px] flex-1 bg-slate-200 mt-1" />}
            </div>

            {/* Content */}
            <div className="pb-3 min-w-0 flex-1">
              <div className="flex items-baseline gap-2 flex-wrap">
                <span className="text-[11px] font-semibold text-slate-700 truncate max-w-xs">
                  {entry.action.replace(/_/g, ' ').toLowerCase().replace(/^\w/, c => c.toUpperCase())}
                </span>
                <span className="text-[10px] text-slate-400 shrink-0">
                  {new Date(entry.createdAt).toLocaleString('es-MX', {
                    day: '2-digit', month: 'short', year: 'numeric',
                    hour: '2-digit', minute: '2-digit',
                  })}
                </span>
              </div>
              <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                <span className="text-[10px] text-slate-400 bg-slate-50 rounded-full px-2 py-0.5 border border-slate-200">
                  {entry.userEmail}
                </span>
                {meta?.message && (
                  <span className="text-[10px] text-slate-600 italic">
                    "{meta.message}"
                  </span>
                )}
                {evidenceUrl && (
                  <button
                    onClick={() => window.open(evidenceUrl, '_blank')}
                    className="inline-flex items-center gap-0.5 text-[10px] text-brand-600 hover:text-brand-700
                               bg-brand-50 hover:bg-brand-100 px-2 py-0.5 rounded-full transition-colors"
                  >
                    <Paperclip size={9} /> Respaldo fotográfico
                  </button>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Smart ST suggestion banner ───────────────────────────────────────────────
function SmartSuggestionBanner({
  plan,
  onCreateST,
}: {
  plan: MaintenancePlanItem[];
  onCreateST: () => void;
}) {
  // Tasks within 20% of their interval (approaching but not yet critical)
  const approaching = useMemo(() => {
    return plan.filter(item => {
      if (!item.intervalHours || !item.hoursRemaining) return false;
      const pct = item.hoursRemaining / item.intervalHours;
      return pct > 0 && pct <= 0.20 && item.status !== 'OVERDUE';
    }).slice(0, 3);
  }, [plan]);

  if (approaching.length === 0) return null;

  return (
    <div className="bg-brand-50 border border-brand-200 rounded-xl p-4 flex items-start gap-3">
      <div className="w-8 h-8 rounded-lg bg-brand-100 flex items-center justify-center shrink-0 mt-0.5">
        <Zap size={16} className="text-brand-600" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold text-brand-800">
          Asesoría inteligente de parada en taller
        </p>
        <p className="text-xs text-brand-600 mt-0.5">
          Aprovechando la próxima entrada a taller, faltan pocas horas para{' '}
          {approaching.length === 1
            ? `la tarea ${approaching[0].taskCode}`
            : `${approaching.length} tareas`}
          . ¿Deseas incluirlas en la siguiente ST?
        </p>
        <div className="flex flex-wrap gap-1.5 mt-2">
          {approaching.map(t => (
            <span key={t.taskId} className="text-[10px] font-mono bg-white text-brand-700 border border-brand-200 px-2 py-0.5 rounded-full">
              {t.taskCode} · {t.hoursRemaining?.toFixed(0)}h restantes
            </span>
          ))}
        </div>
      </div>
      <button
        onClick={onCreateST}
        className="btn-primary text-xs shrink-0 flex items-center gap-1"
      >
        <ClipboardList size={12} />
        Incluir en ST
      </button>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function AircraftProfilePage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [showStatusReport, setShowStatusReport] = useState(false);
  const workRequests = useWorkRequestStore((s) => s.workRequests);
  const viewDensity = useWorkRequestStore((s) => s.viewDensity);
  const setViewDensity = useWorkRequestStore((s) => s.setViewDensity);
  const selectWorkRequest = useWorkRequestStore((s) => s.selectWorkRequest);

  const { data: aircraft, isLoading: loadingAircraft } = useQuery({
    queryKey: ['aircraft', id],
    queryFn: () => aircraftApi.findById(id!),
    enabled: !!id,
  });

  const { data: plan = [], isLoading: loadingPlan } = useQuery({
    queryKey: ['maintenance-plan', id],
    queryFn: () => maintenancePlanApi.getForAircraft(id!),
    enabled: !!id,
    staleTime: 5 * 60 * 1000,
  });

  // ── Computed values ───────────────────────────────────────────────────────
  const nearestHoursTask = useMemo(() =>
    [...plan]
      .filter(i => i.hoursRemaining != null && i.intervalHours != null && i.intervalHours > 0)
      .sort((a, b) => (a.hoursRemaining ?? Infinity) - (b.hoursRemaining ?? Infinity))[0] ?? null,
  [plan]);

  const nearestCalTask = useMemo(() =>
    [...plan]
      .filter(i => i.daysRemaining != null && i.intervalCalendarDays != null && i.intervalCalendarDays > 0)
      .sort((a, b) => (a.daysRemaining ?? Infinity) - (b.daysRemaining ?? Infinity))[0] ?? null,
  [plan]);

  const tsnPct = useMemo(() => {
    if (!nearestHoursTask?.intervalHours || nearestHoursTask.hoursRemaining == null) return 0;
    const consumed = nearestHoursTask.intervalHours - nearestHoursTask.hoursRemaining;
    return Math.max(0, Math.min(100, (consumed / nearestHoursTask.intervalHours) * 100));
  }, [nearestHoursTask]);

  const cyclesPct = useMemo(() => {
    if (!nearestCalTask?.intervalCalendarDays || nearestCalTask.daysRemaining == null) return 0;
    const consumed = nearestCalTask.intervalCalendarDays - nearestCalTask.daysRemaining;
    return Math.max(0, Math.min(100, (consumed / nearestCalTask.intervalCalendarDays) * 100));
  }, [nearestCalTask]);

  const tsnTier: AlertTier = nearestHoursTask ? getAlertTier(nearestHoursTask) : 'ok';
  const cyclesTier: AlertTier = nearestCalTask ? getAlertTier(nearestCalTask) : 'ok';
  const aircraftId = aircraft?.id ?? '';
  const aircraftHours = Number(aircraft?.totalFlightHours ?? 0);
  const aircraftCycles = Number(aircraft?.totalCycles ?? 0);

  const coaExpiryDate    = aircraft?.coaExpiryDate ? new Date(aircraft.coaExpiryDate) : null;
  const coaDaysLeft      = coaExpiryDate
    ? Math.ceil((coaExpiryDate.getTime() - Date.now()) / MS_PER_DAY)
    : null;
  const coaTier: AlertTier    = coaDaysLeft == null ? 'ok'
    : coaDaysLeft < 0  ? 'overdue'
    : coaDaysLeft < 15 ? 'critical'
    : coaDaysLeft < 30 ? 'warning'
    : 'ok';

  const overdueCnt = plan.filter(p => p.status === 'OVERDUE').length;
  const dueSoonCnt = plan.filter(p => p.status === 'DUE_SOON').length;

  const overdueWithoutST = useMemo(() => (
    plan
      .filter((task) => task.status === 'OVERDUE')
      .filter((task) => !resolveTaskSTInfo(task, workRequests, aircraftId).hasST)
      .length
  ), [plan, workRequests, aircraftId]);

  const openAnyOverdueST = useMemo(() => (
    plan
      .filter((task) => task.status === 'OVERDUE')
      .map((task) => resolveTaskSTInfo(task, workRequests, aircraftId))
      .find((info) => info.isOpen) ?? null
  ), [plan, workRequests, aircraftId]);

  const openSTFromProfile = (workRequestId: string | null, taskCode: string) => {
    if (workRequestId) {
      selectWorkRequest(workRequestId, 'general');
      navigate(`/work-requests?aircraftId=${aircraftId}&stId=${workRequestId}`);
      return;
    }
    navigate(`/work-requests?aircraftId=${aircraftId}&search=${encodeURIComponent(taskCode)}`);
  };

  const openWorkRequestsList = (taskCode?: string) => {
    const suffix = taskCode ? `&search=${encodeURIComponent(taskCode)}` : '';
    navigate(`/work-requests?aircraftId=${aircraftId}${suffix}`);
  };

  const createSTForTask = async (task: MaintenancePlanItem) => {
    const taskInfo = resolveTaskSTInfo(task, workRequests, aircraftId);
    if (taskInfo.isOpen && taskInfo.workRequestId) {
      openSTFromProfile(taskInfo.workRequestId, task.taskCode);
      return;
    }

    const stId = await createSTFromSource('maintenance_plan', {
      aircraftId,
      sourceId: task.taskId,
      ataCode: task.taskCode,
      title: task.taskTitle,
      description: task.taskTitle,
      aircraftHoursAtRequest: aircraftHours,
      aircraftCyclesAtRequest: aircraftCycles,
      priority: task.status === 'OVERDUE' ? 'alta' : 'media',
    });

    selectWorkRequest(stId, 'general');
    navigate(`/work-requests?aircraftId=${aircraftId}&stId=${stId}`);
  };

  const generateSTFromProfile = async () => {
    const candidate = plan.find((task) => {
      const info = resolveTaskSTInfo(task, workRequests, aircraftId);
      return task.status === 'OVERDUE' && !info.hasST;
    }) ?? plan.find((task) => {
      const info = resolveTaskSTInfo(task, workRequests, aircraftId);
      return !info.hasST;
    });

    if (!candidate) {
      openWorkRequestsList();
      return;
    }

    await createSTForTask(candidate);
  };

  // ── Render ────────────────────────────────────────────────────────────────
  if (loadingAircraft) {
    return (
      <div className="p-8 flex items-center gap-2 text-slate-400 text-sm">
        <Activity size={16} className="animate-pulse" /> Cargando ficha de aeronave…
      </div>
    );
  }

  if (!aircraft) {
    return (
      <div className="p-8 text-slate-500 text-sm">
        Aeronave no encontrada.{' '}
        <button className="text-brand-600 underline" onClick={() => navigate('/aircraft')}>
          Volver
        </button>
      </div>
    );
  }

  const statusCls = STATUS_CLASSES[aircraft.status] ?? 'bg-slate-100 text-slate-600 border-slate-200';

  return (
    <div className="p-6 lg:p-8 space-y-6 max-w-6xl mx-auto">

      {/* ── Breadcrumb & actions ── */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 transition-colors"
        >
          <ArrowLeft size={15} />
          Volver
        </button>
        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5">
            <button
              type="button"
              onClick={() => setViewDensity('comfortable')}
              className={`px-2 py-1 text-[11px] font-medium rounded-md transition-colors ${
                viewDensity === 'comfortable'
                  ? 'bg-slate-900 text-white'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              Comoda
            </button>
            <button
              type="button"
              onClick={() => setViewDensity('compact')}
              className={`px-2 py-1 text-[11px] font-medium rounded-md transition-colors ${
                viewDensity === 'compact'
                  ? 'bg-slate-900 text-white'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              Compacta
            </button>
          </div>
          <button
            onClick={() => setShowStatusReport(true)}
            className="btn-secondary flex items-center gap-1.5 text-xs"
          >
            <FileText size={13} />
            Reporte DGAC
          </button>
          <button
            onClick={() => navigate(`/work-requests?aircraftId=${aircraft.id}`)}
            className="btn-primary flex items-center gap-1.5 text-xs"
          >
            <ClipboardList size={13} />
            Nueva Solicitud de Trabajo
          </button>
        </div>
      </div>

      {/* ── Aircraft identity header ── */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
        <div className="flex items-start gap-4 flex-wrap">
          <div className="w-14 h-14 rounded-2xl bg-brand-50 flex items-center justify-center shrink-0">
            <Plane size={26} className="text-brand-600" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-3xl font-extrabold font-mono text-slate-900 tracking-tight">
                {aircraft.registration}
              </h1>
              <span className={`text-xs font-bold px-2.5 py-1 rounded-full border ${statusCls}`}>
                {STATUS_LABEL[aircraft.status] ?? aircraft.status}
              </span>
              {overdueCnt > 0 && (
                <span className="text-[11px] font-bold bg-rose-100 text-rose-700 px-2 py-0.5 rounded-full animate-pulse">
                  {overdueCnt} tarea{overdueCnt > 1 ? 's' : ''} vencida{overdueCnt > 1 ? 's' : ''}
                </span>
              )}
              {dueSoonCnt > 0 && (
                <span className="text-[11px] font-bold bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">
                  {dueSoonCnt} próximas
                </span>
              )}
            </div>
            <p className="text-slate-500 mt-1 text-sm">
              {aircraft.manufacturer} · {aircraft.model} · S/N: {aircraft.serialNumber}
            </p>
            {aircraft.engineModel && (
              <p className="text-xs text-slate-400 mt-0.5">
                Motor: {aircraft.engineModel} · {aircraft.engineCount} motor{aircraft.engineCount !== 1 ? 'es' : ''}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* ── Counter cards ── */}
      <div>
        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">
          Contadores Actualizados
        </p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {/* TSN ring */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 flex flex-col items-center gap-2">
            <ProgressRing
              pct={tsnPct}
              value={Number(aircraft.totalFlightHours).toLocaleString('es-MX', { maximumFractionDigits: 1 })}
              unit="h TSN"
              label="Horas Totales"
              tier={tsnTier}
              sublabel={nearestHoursTask ? `Próx. ATA ${nearestHoursTask.taskCode}` : 'Sin tarea h.'}
            />
          </div>

          {/* Cycles ring */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 flex flex-col items-center gap-2">
            <ProgressRing
              pct={cyclesPct}
              value={Number(aircraft.totalCycles).toLocaleString('es-MX')}
              unit="Ciclos"
              label="Ciclos N1"
              tier={cyclesTier}
              sublabel={nearestCalTask ? `Próx. ${nearestCalTask.taskCode}` : 'Sin tarea cal.'}
            />
          </div>

          {/* Nearest task */}
          <StatCard
            Icon={Clock}
            label="Próxima Tarea"
            value={
              nearestHoursTask
                ? nearestHoursTask.hoursRemaining! < 0
                  ? 'VENCIDA'
                  : `${nearestHoursTask.hoursRemaining!.toFixed(0)} h`
                : '—'
            }
            sub={nearestHoursTask?.taskTitle ?? 'Sin tareas con horas'}
            colorClass={
              tsnTier === 'overdue' || tsnTier === 'critical'
                ? 'bg-rose-50 text-rose-500'
                : tsnTier === 'warning'
                  ? 'bg-amber-50 text-amber-500'
                  : 'bg-emerald-50 text-emerald-500'
            }
          />

          {/* CdN expiry */}
          <StatCard
            Icon={Calendar}
            label="Vto. CdN"
            value={
              coaDaysLeft != null
                ? coaDaysLeft < 0
                  ? 'VENCIDO'
                  : `${coaDaysLeft}d`
                : '—'
            }
            sub={
              coaExpiryDate
                ? coaExpiryDate.toLocaleDateString('es-MX', { day: '2-digit', month: 'long', year: 'numeric' })
                : 'Sin fecha'
            }
            colorClass={
              coaTier === 'overdue' || coaTier === 'critical'
                ? 'bg-rose-50 text-rose-500'
                : coaTier === 'warning'
                  ? 'bg-amber-50 text-amber-500'
                  : 'bg-emerald-50 text-emerald-500'
            }
          />
        </div>
      </div>

      {/* ── Smart ST suggestion ── */}
      <SmartSuggestionBanner
        plan={plan}
        onCreateST={() => generateSTFromProfile()}
      />

      {/* ── Semáforo de próximos vencimientos ── */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <div className="w-7 h-7 rounded-lg bg-amber-50 flex items-center justify-center">
            <Gauge size={14} className="text-amber-600" />
          </div>
          <p className="text-sm font-bold text-slate-900">Semáforo de Próximos Vencimientos</p>
          <span className="text-[10px] text-slate-400">
            · top 10 por urgencia (dual: horas y calendario)
          </span>
          {loadingPlan && (
            <Activity size={12} className="text-slate-300 animate-pulse ml-1" />
          )}
        </div>
        <SemaphoreTable
          plan={plan}
          aircraftId={aircraft.id}
          workRequests={workRequests}
          viewDensity={viewDensity}
          onOpenST={openSTFromProfile}
          onGenerateST={generateSTFromProfile}
        />
      </div>

      {/* ── Historial reciente ── */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <div className="w-7 h-7 rounded-lg bg-slate-100 flex items-center justify-center">
            <RotateCcw size={14} className="text-slate-500" />
          </div>
          <p className="text-sm font-bold text-slate-900">Historial Reciente de Bitácora</p>
          <span className="text-[10px] text-slate-400">· últimas 5 acciones con respaldos fotográficos</span>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
          <AuditTimeline aircraftId={aircraft.id} />
          <div className="mt-4 pt-3 border-t border-slate-100">
            <button
              onClick={() => openWorkRequestsList()}
              className="flex items-center gap-1.5 text-xs text-brand-600 hover:text-brand-700 font-semibold transition-colors"
            >
              <ExternalLink size={12} />
              Ver todas las Solicitudes de Trabajo de esta aeronave
            </button>
          </div>
        </div>
      </div>

      {/* ── Footer quick action (AOG pulse) ── */}
      {(overdueCnt > 0 || aircraft.status === 'AOG') && (
        <div className="bg-rose-50 border border-rose-200 rounded-2xl p-5 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="relative w-10 h-10 rounded-xl bg-rose-100 flex items-center justify-center shrink-0">
              <span className="absolute inset-0 rounded-xl border border-rose-300 animate-ping opacity-50" />
              <AlertTriangle size={18} className="text-rose-600" />
            </div>
            <div>
              <p className="text-sm font-bold text-rose-800">Aeronave requiere atención inmediata</p>
              <p className="text-xs text-rose-600 mt-0.5">
                {overdueWithoutST > 0
                  ? `${overdueWithoutST} tarea${overdueWithoutST > 1 ? 's' : ''} vencida${overdueWithoutST > 1 ? 's' : ''} sin solicitud enviada`
                  : `Estado ${STATUS_LABEL[aircraft.status]} — iniciar proceso de regularización`}
              </p>
              {openAnyOverdueST?.isOpen && (
                <p className="text-[11px] text-amber-700 mt-1">Aviso: ya existe una ST abierta para al menos una tarea vencida.</p>
              )}
            </div>
          </div>
          <button
            onClick={() => {
              if (overdueWithoutST > 0) generateSTFromProfile();
              else if (openAnyOverdueST) openSTFromProfile(openAnyOverdueST.workRequestId, '');
            }}
            className="bg-rose-600 hover:bg-rose-700 text-white text-sm font-bold px-4 py-2.5 rounded-xl
                       flex items-center gap-2 transition-colors shadow-sm animate-pulse"
          >
            <ClipboardList size={14} />
            {overdueWithoutST > 0 ? 'Agregar a ST' : 'Ver ST'}
          </button>
        </div>
      )}

      {/* ── DGAC Report modal ── */}
      {showStatusReport && (
        <AircraftStatusReport
          aircraftId={aircraft.id}
          registration={aircraft.registration}
          model={aircraft.model}
          currentHours={Number(aircraft.totalFlightHours)}
          onClose={() => setShowStatusReport(false)}
        />
      )}
    </div>
  );
}

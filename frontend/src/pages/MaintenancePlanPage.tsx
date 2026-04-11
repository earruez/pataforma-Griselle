import { useState, useMemo, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { aircraftApi } from '@api/aircraft.api';
import type { Aircraft } from '@api/aircraft.api';
import { maintenancePlanApi } from '@api/maintenancePlan.api';
import type { MaintenancePlanItem, PlanItemStatus } from '@api/maintenancePlan.api';
import { tasksApi } from '@api/tasks.api';
import type { TaskDefinition, CreateTaskInput } from '@api/tasks.api';
import { complianceApi } from '@api/compliance.api';
import type { RecordComplianceInput } from '@api/compliance.api';
import {
  ClipboardCheck, AlertTriangle, Clock, CheckCircle2,
  ChevronRight, Search, BookOpen, Calendar, Gauge, RefreshCw,
  Plus, Pencil, Trash2, X, Check,
} from 'lucide-react';

// ─── Status helpers ────────────────────────────────────────────────────────────
const STATUS_ORDER: Record<PlanItemStatus, number> = { OVERDUE: 0, DUE_SOON: 1, NEVER_PERFORMED: 2, OK: 3 };

const STATUS_META: Record<PlanItemStatus, { label: string; badge: string; icon: typeof AlertTriangle }> = {
  OVERDUE:         { label: 'Vencida',        badge: 'badge-overdue',      icon: AlertTriangle },
  DUE_SOON:        { label: 'Próx. vencer',   badge: 'badge-deferred',     icon: Clock },
  OK:              { label: 'Al día',         badge: 'badge-operational',  icon: CheckCircle2 },
  NEVER_PERFORMED: { label: 'Sin registro',   badge: 'badge-decommissioned', icon: BookOpen },
};

const REF_BADGE: Record<string, string> = {
  AD:       'bg-rose-50 text-rose-700 ring-rose-600/20',
  AMM:      'bg-blue-50 text-blue-700 ring-blue-600/20',
  SB:       'bg-purple-50 text-purple-700 ring-purple-600/20',
  CMR:      'bg-orange-50 text-orange-700 ring-orange-600/20',
  INTERNAL: 'bg-slate-100 text-slate-600 ring-slate-400/20',
  MPD:      'bg-teal-50 text-teal-700 ring-teal-600/20',
  ETOPS:    'bg-indigo-50 text-indigo-700 ring-indigo-600/20',
};

function refBadge(type: string) {
  return `inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-bold ring-1 ring-inset ${REF_BADGE[type] ?? REF_BADGE.INTERNAL}`;
}

// ─── Interval & reference options ─────────────────────────────────────────────
const INTERVAL_TYPES = [
  { value: 'FLIGHT_HOURS',            label: 'Horas de vuelo' },
  { value: 'CYCLES',                  label: 'Ciclos' },
  { value: 'CALENDAR_DAYS',           label: 'Días calendario' },
  { value: 'FLIGHT_HOURS_OR_CALENDAR',label: 'H. vuelo o calendario' },
  { value: 'ON_CONDITION',            label: 'A condición' },
];

const REFERENCE_TYPES = ['AD', 'AMM', 'SB', 'CMR', 'MPD', 'ETOPS', 'INTERNAL'];

// ─── Modal shell ──────────────────────────────────────────────────────────────
function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-[2px] flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg flex flex-col max-h-[90vh] overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 shrink-0">
          <h2 className="text-sm font-bold text-slate-900">{title}</h2>
          <button onClick={onClose} className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors">
            <X size={15} className="text-slate-500" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

// ─── Modal 1: Record Compliance ───────────────────────────────────────────────
function RecordComplianceModal({
  item, aircraftId, onClose, onSubmit, isPending,
}: {
  item: MaintenancePlanItem;
  aircraftId: string;
  onClose: () => void;
  onSubmit: (input: RecordComplianceInput) => void;
  isPending: boolean;
}) {
  const today = new Date().toISOString().split('T')[0];
  const [performedAt, setPerformedAt] = useState(today);
  const [workOrderNumber, setWorkOrderNumber] = useState('');
  const [notes, setNotes] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!performedAt) { toast.error('Ingresa la fecha de realización'); return; }
    onSubmit({
      aircraftId,
      taskId: item.taskId,
      performedAt,
      workOrderNumber: workOrderNumber.trim() || null,
      notes: notes.trim() || null,
    });
  };

  return (
    <Modal title={`Registrar cumplimiento — ${item.taskCode}`} onClose={onClose}>
      <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
        <div className="px-6 py-5 space-y-4 overflow-y-auto">
          <div className="bg-slate-50 rounded-xl p-3.5">
            <p className="text-xs font-semibold text-slate-700">{item.taskTitle}</p>
            <p className="text-[11px] text-slate-400 mt-0.5">
              <span className={refBadge(item.referenceType)}>{item.referenceType}</span>
              {item.referenceNumber && <span className="ml-1.5">{item.referenceNumber}</span>}
            </p>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">
              Fecha de realización <span className="text-rose-500">*</span>
            </label>
            <input
              type="date"
              value={performedAt}
              max={today}
              onChange={e => setPerformedAt(e.target.value)}
              className="input"
              required
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">N° Orden de trabajo</label>
            <input
              type="text"
              value={workOrderNumber}
              onChange={e => setWorkOrderNumber(e.target.value)}
              placeholder="WO-2024-001"
              className="input"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Notas</label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={3}
              placeholder="Observaciones, materiales usados, etc."
              className="input resize-none"
            />
          </div>
        </div>
        <div className="px-6 py-4 border-t border-slate-100 flex justify-end gap-2.5 shrink-0">
          <button type="button" onClick={onClose} className="btn-secondary">Cancelar</button>
          <button type="submit" disabled={isPending} className="btn-primary">
            {isPending ? 'Guardando…' : 'Registrar cumplimiento'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// ─── Modal 2: Assign task ─────────────────────────────────────────────────────
function AssignTaskModal({
  aircraftId, assignedTaskIds, onClose, onAssign, onCreateNew, isPending,
}: {
  aircraftId: string;
  assignedTaskIds: string[];
  onClose: () => void;
  onAssign: (taskId: string) => void;
  onCreateNew: () => void;
  isPending: boolean;
}) {
  const [search, setSearch] = useState('');
  const { data: allTasks = [], isLoading } = useQuery({
    queryKey: ['tasks'],
    queryFn: tasksApi.listAll,
  });

  const available = useMemo(() =>
    allTasks
      .filter(t => t.isActive && !assignedTaskIds.includes(t.id))
      .filter(t => !search || t.code.toLowerCase().includes(search.toLowerCase()) || t.title.toLowerCase().includes(search.toLowerCase())),
    [allTasks, assignedTaskIds, search],
  );

  return (
    <Modal title="Agregar tarea al plan" onClose={onClose}>
      <div className="flex flex-col flex-1 overflow-hidden">
        <div className="px-6 pt-4 pb-2 shrink-0 space-y-3">
          <div className="relative">
            <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar por código o descripción…"
              className="input pl-8"
            />
          </div>
          <button onClick={onCreateNew} className="btn-secondary w-full justify-center gap-2 text-xs">
            <Plus size={14} />
            Crear nueva tarea
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 pb-4 space-y-1 min-h-0">
          {isLoading && <p className="text-center py-8 text-xs text-slate-400">Cargando tareas…</p>}
          {!isLoading && available.length === 0 && (
            <p className="text-center py-8 text-xs text-slate-400">
              {allTasks.length === 0 ? 'No hay tareas definidas en la organización.' : 'Todas las tareas ya están asignadas o no coincide la búsqueda.'}
            </p>
          )}
          {available.map(task => (
            <div key={task.id} className="flex items-center gap-3 rounded-xl border border-slate-100 hover:border-slate-200 hover:bg-slate-50/60 px-3.5 py-3 transition-colors group">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs font-bold text-slate-800">{task.code}</span>
                  <span className={refBadge(task.referenceType)}>{task.referenceType}</span>
                  {task.isMandatory && <span className="text-[10px] text-rose-600 font-bold">OBLIGATORIA</span>}
                </div>
                <p className="text-xs text-slate-500 truncate mt-0.5">{task.title}</p>
              </div>
              <button
                onClick={() => onAssign(task.id)}
                disabled={isPending}
                className="shrink-0 flex items-center gap-1.5 text-xs font-semibold text-brand-600 hover:text-brand-700 disabled:opacity-50 transition-colors opacity-0 group-hover:opacity-100"
              >
                <Plus size={13} /> Asignar
              </button>
            </div>
          ))}
        </div>
        <div className="px-6 py-4 border-t border-slate-100 flex justify-end shrink-0">
          <button onClick={onClose} className="btn-secondary">Cerrar</button>
        </div>
      </div>
    </Modal>
  );
}

// ─── Modal 3: Create / Edit task definition ───────────────────────────────────
type TaskFormState = {
  code: string;
  title: string;
  description: string;
  intervalType: string;
  intervalHours: string;
  intervalCycles: string;
  intervalCalendarDays: string;
  toleranceHours: string;
  toleranceCycles: string;
  toleranceCalendarDays: string;
  referenceType: string;
  referenceNumber: string;
  isMandatory: boolean;
  requiresInspection: boolean;
  estimatedManHours: string;
};

function blankForm(): TaskFormState {
  return {
    code: '', title: '', description: '', intervalType: 'FLIGHT_HOURS',
    intervalHours: '', intervalCycles: '', intervalCalendarDays: '',
    toleranceHours: '', toleranceCycles: '', toleranceCalendarDays: '',
    referenceType: 'AMM', referenceNumber: '',
    isMandatory: false, requiresInspection: false, estimatedManHours: '',
  };
}

function taskToForm(task: TaskDefinition): TaskFormState {
  return {
    code: task.code,
    title: task.title,
    description: task.description,
    intervalType: task.intervalType,
    intervalHours: task.intervalHours != null ? String(task.intervalHours) : '',
    intervalCycles: task.intervalCycles != null ? String(task.intervalCycles) : '',
    intervalCalendarDays: task.intervalCalendarDays != null ? String(task.intervalCalendarDays) : '',
    toleranceHours: task.toleranceHours != null ? String(task.toleranceHours) : '',
    toleranceCycles: task.toleranceCycles != null ? String(task.toleranceCycles) : '',
    toleranceCalendarDays: task.toleranceCalendarDays != null ? String(task.toleranceCalendarDays) : '',
    referenceType: task.referenceType,
    referenceNumber: task.referenceNumber ?? '',
    isMandatory: task.isMandatory,
    requiresInspection: task.requiresInspection,
    estimatedManHours: task.estimatedManHours != null ? String(task.estimatedManHours) : '',
  };
}

function formToInput(f: TaskFormState): CreateTaskInput {
  return {
    code: f.code.trim().toUpperCase(),
    title: f.title.trim(),
    description: f.description.trim(),
    intervalType: f.intervalType,
    intervalHours: f.intervalHours ? Number(f.intervalHours) : null,
    intervalCycles: f.intervalCycles ? Number(f.intervalCycles) : null,
    intervalCalendarDays: f.intervalCalendarDays ? Number(f.intervalCalendarDays) : null,
    toleranceHours: f.toleranceHours ? Number(f.toleranceHours) : null,
    toleranceCycles: f.toleranceCycles ? Number(f.toleranceCycles) : null,
    toleranceCalendarDays: f.toleranceCalendarDays ? Number(f.toleranceCalendarDays) : null,
    referenceType: f.referenceType,
    referenceNumber: f.referenceNumber.trim() || null,
    isMandatory: f.isMandatory,
    requiresInspection: f.requiresInspection,
    estimatedManHours: f.estimatedManHours ? Number(f.estimatedManHours) : null,
  };
}

function CreateEditTaskModal({
  task, onClose, onCreate, onUpdate, isPending,
}: {
  task: TaskDefinition | null;
  onClose: () => void;
  onCreate: (input: CreateTaskInput) => void;
  onUpdate: (id: string, input: Partial<CreateTaskInput>) => void;
  isPending: boolean;
}) {
  const isEdit = task !== null;
  const [form, setForm] = useState<TaskFormState>(() => isEdit ? taskToForm(task!) : blankForm());

  const set = (k: keyof TaskFormState, v: string | boolean) =>
    setForm(prev => ({ ...prev, [k]: v }));

  const showHours    = form.intervalType === 'FLIGHT_HOURS' || form.intervalType === 'FLIGHT_HOURS_OR_CALENDAR';
  const showCycles   = form.intervalType === 'CYCLES';
  const showCalendar = form.intervalType === 'CALENDAR_DAYS' || form.intervalType === 'FLIGHT_HOURS_OR_CALENDAR' || form.intervalType === 'ON_CONDITION';

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim()) { toast.error('El título es obligatorio'); return; }
    if (!isEdit && !form.code.trim()) { toast.error('El código es obligatorio'); return; }
    const input = formToInput(form);
    if (isEdit) {
      const { code: _code, ...rest } = input;
      onUpdate(task!.id, rest);
    } else {
      onCreate(input);
    }
  };

  const F = ({ label, children, required }: { label: string; children: React.ReactNode; required?: boolean }) => (
    <div>
      <label className="block text-xs font-semibold text-slate-600 mb-1">
        {label}{required && <span className="text-rose-500 ml-0.5">*</span>}
      </label>
      {children}
    </div>
  );

  return (
    <Modal title={isEdit ? `Editar tarea — ${task!.code}` : 'Nueva tarea'} onClose={onClose}>
      <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
        <div className="px-6 py-5 space-y-4 overflow-y-auto flex-1">
          <div className="grid grid-cols-2 gap-3">
            {!isEdit && (
              <F label="Código" required>
                <input value={form.code} onChange={e => set('code', e.target.value.toUpperCase())}
                  placeholder="EG. TRK-100" className="input font-mono uppercase" required />
              </F>
            )}
            <F label="Tipo de intervalo" required>
              <select value={form.intervalType} onChange={e => set('intervalType', e.target.value)} className="input">
                {INTERVAL_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </F>
          </div>

          <F label="Título" required>
            <input value={form.title} onChange={e => set('title', e.target.value)}
              placeholder="Descripción corta de la tarea" className="input" required />
          </F>

          <F label="Descripción">
            <textarea value={form.description} onChange={e => set('description', e.target.value)}
              rows={2} placeholder="Procedimiento, alcance, notas…" className="input resize-none" />
          </F>

          {/* Interval values */}
          {form.intervalType !== 'ON_CONDITION' && (
            <div className="grid grid-cols-3 gap-3">
              {showHours && (
                <F label="Intervalo (h)">
                  <input type="number" min="1" value={form.intervalHours}
                    onChange={e => set('intervalHours', e.target.value)} className="input" />
                </F>
              )}
              {showCycles && (
                <F label="Intervalo (cic.)">
                  <input type="number" min="1" value={form.intervalCycles}
                    onChange={e => set('intervalCycles', e.target.value)} className="input" />
                </F>
              )}
              {showCalendar && (
                <F label="Intervalo (días)">
                  <input type="number" min="1" value={form.intervalCalendarDays}
                    onChange={e => set('intervalCalendarDays', e.target.value)} className="input" />
                </F>
              )}
              {showHours && (
                <F label="Tolerancia (h)">
                  <input type="number" min="0" value={form.toleranceHours}
                    onChange={e => set('toleranceHours', e.target.value)} className="input" />
                </F>
              )}
              {showCycles && (
                <F label="Tolerancia (cic.)">
                  <input type="number" min="0" value={form.toleranceCycles}
                    onChange={e => set('toleranceCycles', e.target.value)} className="input" />
                </F>
              )}
              {showCalendar && (
                <F label="Tolerancia (días)">
                  <input type="number" min="0" value={form.toleranceCalendarDays}
                    onChange={e => set('toleranceCalendarDays', e.target.value)} className="input" />
                </F>
              )}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <F label="Tipo de referencia">
              <select value={form.referenceType} onChange={e => set('referenceType', e.target.value)} className="input">
                {REFERENCE_TYPES.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </F>
            <F label="N° de referencia">
              <input value={form.referenceNumber} onChange={e => set('referenceNumber', e.target.value)}
                placeholder="AMM 05-10-00" className="input" />
            </F>
          </div>

          <F label="Horas-hombre estimadas">
            <input type="number" min="0" step="0.5" value={form.estimatedManHours}
              onChange={e => set('estimatedManHours', e.target.value)} className="input" placeholder="4" />
          </F>

          <div className="flex gap-5 pt-1">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={form.isMandatory}
                onChange={e => set('isMandatory', e.target.checked)} className="rounded border-slate-300 text-brand-600 focus:ring-brand-500" />
              <span className="text-xs font-medium text-slate-700">Obligatoria (AD / CMR)</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={form.requiresInspection}
                onChange={e => set('requiresInspection', e.target.checked)} className="rounded border-slate-300 text-brand-600 focus:ring-brand-500" />
              <span className="text-xs font-medium text-slate-700">Requiere inspección</span>
            </label>
          </div>
        </div>
        <div className="px-6 py-4 border-t border-slate-100 flex justify-end gap-2.5 shrink-0">
          <button type="button" onClick={onClose} className="btn-secondary">Cancelar</button>
          <button type="submit" disabled={isPending} className="btn-primary">
            {isPending ? 'Guardando…' : isEdit ? 'Guardar cambios' : 'Crear tarea'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// ─── Modal 4: Confirm remove ──────────────────────────────────────────────────
function ConfirmRemoveModal({
  item, registration, onClose, onConfirm, isPending,
}: {
  item: MaintenancePlanItem;
  registration: string;
  onClose: () => void;
  onConfirm: () => void;
  isPending: boolean;
}) {
  return (
    <Modal title="Eliminar tarea del plan" onClose={onClose}>
      <div className="px-6 py-5">
        <p className="text-sm text-slate-700">
          ¿Confirmas eliminar{' '}
          <span className="font-bold text-slate-900">{item.taskCode}</span>{' '}
          del plan de mantenimiento de{' '}
          <span className="font-bold text-slate-900">{registration}</span>?
        </p>
        <p className="text-xs text-slate-400 mt-2">
          {item.taskTitle}. Esta acción solo desvincula la tarea del plan; los registros de cumplimiento anteriores se conservan.
        </p>
      </div>
      <div className="px-6 py-4 border-t border-slate-100 flex justify-end gap-2.5">
        <button onClick={onClose} className="btn-secondary">Cancelar</button>
        <button
          onClick={onConfirm}
          disabled={isPending}
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white shadow-sm border border-rose-700/20 hover:bg-rose-700 active:bg-rose-800 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-150"
        >
          {isPending ? 'Eliminando…' : 'Sí, eliminar del plan'}
        </button>
      </div>
    </Modal>
  );
}

// ─── Summary bar ──────────────────────────────────────────────────────────────
function SummaryBar({ items }: { items: MaintenancePlanItem[] }) {
  const overdue  = items.filter(i => i.status === 'OVERDUE').length;
  const dueSoon  = items.filter(i => i.status === 'DUE_SOON').length;
  const ok       = items.filter(i => i.status === 'OK').length;
  const never    = items.filter(i => i.status === 'NEVER_PERFORMED').length;
  const total    = items.length;

  const cards = [
    { label: 'Vencidas',     value: overdue, cls: 'text-rose-700',   bg: 'bg-rose-50 border-rose-200',    dot: 'bg-rose-500' },
    { label: 'Próx. vencer', value: dueSoon, cls: 'text-amber-700',  bg: 'bg-amber-50 border-amber-200',  dot: 'bg-amber-400' },
    { label: 'Al día',       value: ok,      cls: 'text-emerald-700',bg: 'bg-emerald-50 border-emerald-200', dot: 'bg-emerald-500' },
    { label: 'Sin registro', value: never,   cls: 'text-slate-600',  bg: 'bg-slate-50 border-slate-200',  dot: 'bg-slate-400' },
  ];

  return (
    <div className="grid grid-cols-4 gap-3 shrink-0">
      {cards.map(c => (
        <div key={c.label} className={`rounded-xl border ${c.bg} p-3.5 flex items-center gap-3`}>
          <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${c.dot}`} />
          <div>
            <p className={`text-xl font-bold tabular-nums leading-none ${c.cls}`}>{c.value}</p>
            <p className="text-[11px] text-slate-500 mt-0.5">{c.label}</p>
          </div>
          {c.value > 0 && total > 0 && (
            <span className="ml-auto text-[10px] text-slate-400">
              {Math.round((c.value / total) * 100)}%
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Task row ─────────────────────────────────────────────────────────────────
interface TaskRowProps {
  item: MaintenancePlanItem;
  onRecord: (item: MaintenancePlanItem) => void;
  onEdit:   (item: MaintenancePlanItem) => void;
  onRemove: (item: MaintenancePlanItem) => void;
}

function TaskRow({ item, onRecord, onEdit, onRemove }: TaskRowProps) {
  const meta = STATUS_META[item.status];
  const StatusIcon = meta.icon;

  const intervalLabel = () => {
    const parts = [];
    if (item.intervalHours)        parts.push(`${item.intervalHours}h`);
    if (item.intervalCycles)       parts.push(`${item.intervalCycles} cic.`);
    if (item.intervalCalendarDays) parts.push(`${item.intervalCalendarDays}d`);
    return parts.join(' / ') || '—';
  };

  const nextDueLabel = () => {
    const parts = [];
    if (item.nextDueHours)  parts.push(`${item.nextDueHours.toFixed(0)}h`);
    if (item.nextDueCycles) parts.push(`${item.nextDueCycles} cic.`);
    if (item.nextDueDate)   parts.push(new Date(item.nextDueDate).toLocaleDateString('es-MX'));
    return parts.join(' · ') || '—';
  };

  const remainingLabel = () => {
    const parts = [];
    if (item.hoursRemaining  != null) parts.push(`${item.hoursRemaining > 0 ? '+' : ''}${item.hoursRemaining}h`);
    if (item.cyclesRemaining != null) parts.push(`${item.cyclesRemaining > 0 ? '+' : ''}${item.cyclesRemaining} cic.`);
    if (item.daysRemaining   != null) parts.push(`${item.daysRemaining > 0 ? '+' : ''}${item.daysRemaining}d`);
    return parts.join(' · ') || null;
  };

  const rowBg = item.status === 'OVERDUE' ? 'bg-rose-50/60'
    : item.status === 'DUE_SOON' ? 'bg-amber-50/40'
    : '';

  return (
    <tr className={`group border-b border-slate-100 last:border-0 transition-colors hover:bg-slate-50/80 ${rowBg}`}>
      {/* Status icon */}
      <td className="px-4 py-3.5 w-8">
        <StatusIcon size={14} className={
          item.status === 'OVERDUE'   ? 'text-rose-500' :
          item.status === 'DUE_SOON'  ? 'text-amber-500' :
          item.status === 'OK'        ? 'text-emerald-500' : 'text-slate-400'
        } />
      </td>
      {/* Code + title */}
      <td className="px-2 py-3.5 min-w-[180px]">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-mono text-xs font-bold text-slate-800">{item.taskCode}</span>
          {item.isMandatory && <span className={refBadge(item.referenceType)}>{item.referenceType}</span>}
        </div>
        <p className="text-xs text-slate-500 mt-0.5 line-clamp-1">{item.taskTitle}</p>
      </td>
      {/* Interval */}
      <td className="table-cell text-xs text-slate-500 whitespace-nowrap">
        <span className="flex items-center gap-1">
          <RefreshCw size={11} className="text-slate-300 shrink-0" />
          {intervalLabel()}
        </span>
      </td>
      {/* Next due */}
      <td className="table-cell text-xs whitespace-nowrap">
        <span className={item.status === 'OVERDUE' ? 'text-rose-700 font-semibold' : item.status === 'DUE_SOON' ? 'text-amber-700' : 'text-slate-600'}>
          {nextDueLabel()}
        </span>
        {remainingLabel() && (
          <p className={`text-[10px] mt-0.5 ${
            item.status === 'OVERDUE' ? 'text-rose-500' :
            item.status === 'DUE_SOON' ? 'text-amber-500' : 'text-slate-400'
          }`}>
            {remainingLabel()}
          </p>
        )}
      </td>
      {/* Last performed */}
      <td className="table-cell text-xs text-slate-500 whitespace-nowrap">
        {item.lastPerformedAt
          ? <span className="flex items-center gap-1">
              <Calendar size={11} className="text-slate-300 shrink-0" />
              {new Date(item.lastPerformedAt).toLocaleDateString('es-MX')}
              {item.lastHoursAtCompliance != null && (
                <span className="text-slate-400"> · {item.lastHoursAtCompliance.toFixed(0)}h</span>
              )}
            </span>
          : <span className="text-slate-300">—</span>
        }
        {item.lastWorkOrder && (
          <p className="text-[10px] text-slate-400 mt-0.5">{item.lastWorkOrder}</p>
        )}
      </td>
      {/* MH estimate */}
      <td className="table-cell text-xs text-slate-500 text-right whitespace-nowrap">
        {item.estimatedManHours != null
          ? <span className="flex items-center justify-end gap-1">
              <Gauge size={11} className="text-slate-300" />{item.estimatedManHours}h
            </span>
          : <span className="text-slate-300">—</span>
        }
      </td>
      {/* Status badge */}
      <td className="px-4 py-3.5 text-right whitespace-nowrap">
        <span className={meta.badge}>{meta.label}</span>
      </td>
      {/* Actions */}
      <td className="pr-4 py-3.5 whitespace-nowrap">
        <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            title="Registrar cumplimiento"
            onClick={() => onRecord(item)}
            className="p-1.5 rounded-lg text-emerald-600 hover:bg-emerald-50 transition-colors"
          >
            <Check size={14} />
          </button>
          <button
            title="Editar tarea"
            onClick={() => onEdit(item)}
            className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 transition-colors"
          >
            <Pencil size={13} />
          </button>
          <button
            title="Eliminar del plan"
            onClick={() => onRemove(item)}
            className="p-1.5 rounded-lg text-rose-500 hover:bg-rose-50 transition-colors"
          >
            <Trash2 size={13} />
          </button>
        </div>
      </td>
    </tr>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
type ModalState =
  | null
  | { type: 'record-compliance'; item: MaintenancePlanItem }
  | { type: 'assign-task' }
  | { type: 'create-task' }
  | { type: 'edit-task'; task: TaskDefinition }
  | { type: 'confirm-remove'; item: MaintenancePlanItem };

export default function MaintenancePlanPage() {
  const [searchParams] = useSearchParams();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<PlanItemStatus | ''>(searchParams.get('status') as PlanItemStatus | '' ?? '');

  // Sync URL → filter when navigating here from Dashboard
  useEffect(() => {
    const s = searchParams.get('status') as PlanItemStatus | '';
    if (s) setFilterStatus(s);
  }, [searchParams]);
  const [modal, setModal] = useState<ModalState>(null);

  const qc = useQueryClient();

  const { data: result, isLoading: loadingAircraft } = useQuery({
    queryKey: ['aircraft'],
    queryFn: () => aircraftApi.findAll(),
  });
  const allAircraft: Aircraft[] = result ?? [];

  const { data: planItems = [], isLoading: loadingPlan } = useQuery({
    queryKey: ['maintenance-plan', selectedId],
    queryFn: () => maintenancePlanApi.getForAircraft(selectedId!),
    enabled: !!selectedId,
  });

  // All org tasks — preloaded so "edit" can look up the full definition
  const { data: allTasks = [] } = useQuery({ queryKey: ['tasks'], queryFn: tasksApi.listAll });

  const selectedAircraft = allAircraft.find(a => a.id === selectedId) ?? null;

  const invalidatePlan = () => qc.invalidateQueries({ queryKey: ['maintenance-plan', selectedId] });

  // ── Mutations ──────────────────────────────────────────────────────────────
  const recordMutation = useMutation({
    mutationFn: (input: RecordComplianceInput) => complianceApi.record(input),
    onSuccess: () => { toast.success('Cumplimiento registrado'); setModal(null); invalidatePlan(); },
    onError: () => toast.error('No se pudo registrar el cumplimiento'),
  });

  const assignMutation = useMutation({
    mutationFn: (taskId: string) => tasksApi.assignToAircraft(selectedId!, taskId),
    onSuccess: () => { toast.success('Tarea asignada al plan'); invalidatePlan(); },
    onError: () => toast.error('No se pudo asignar la tarea'),
  });

  const removeMutation = useMutation({
    mutationFn: (taskId: string) => tasksApi.removeFromAircraft(selectedId!, taskId),
    onSuccess: () => { toast.success('Tarea eliminada del plan'); setModal(null); invalidatePlan(); },
    onError: () => toast.error('No se pudo eliminar la tarea'),
  });

  const createTaskMutation = useMutation({
    mutationFn: (input: CreateTaskInput) => tasksApi.create(input),
    onSuccess: (task) => {
      toast.success(`Tarea ${task.code} creada`);
      qc.invalidateQueries({ queryKey: ['tasks'] });
      // Auto-assign to current aircraft if one is selected
      if (selectedId) {
        tasksApi.assignToAircraft(selectedId, task.id).then(invalidatePlan).catch(() => void 0);
      }
      setModal(null);
    },
    onError: (err: Error) => toast.error(err.message ?? 'No se pudo crear la tarea'),
  });

  const updateTaskMutation = useMutation({
    mutationFn: ({ id, input }: { id: string; input: Partial<CreateTaskInput> }) => tasksApi.update(id, input),
    onSuccess: () => {
      toast.success('Tarea actualizada');
      qc.invalidateQueries({ queryKey: ['tasks'] });
      invalidatePlan();
      setModal(null);
    },
    onError: () => toast.error('No se pudo actualizar la tarea'),
  });

  const selectedAircraftReg = selectedAircraft?.registration ?? '';
  const assignedTaskIds = useMemo(() => planItems.map(i => i.taskId), [planItems]);

  // Health badge per aircraft
  const healthMap = useMemo(() => {
    const map = new Map<string, { overdue: number; dueSoon: number }>();
    if (selectedAircraft) {
      const overdue = planItems.filter(i => i.status === 'OVERDUE').length;
      const dueSoon = planItems.filter(i => i.status === 'DUE_SOON').length;
      map.set(selectedId!, { overdue, dueSoon });
    }
    return map;
  }, [selectedId, planItems, selectedAircraft]);

  const filteredPlan = useMemo(() => {
    return planItems
      .filter(i => {
        if (filterStatus && i.status !== filterStatus) return false;
        if (search) {
          const q = search.toLowerCase();
          return i.taskCode.toLowerCase().includes(q) || i.taskTitle.toLowerCase().includes(q);
        }
        return true;
      })
      .sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status]);
  }, [planItems, filterStatus, search]);

  // Handlers for TaskRow callbacks
  const handleRecord = (item: MaintenancePlanItem) => setModal({ type: 'record-compliance', item });
  const handleEdit   = (item: MaintenancePlanItem) => {
    const task = allTasks.find(t => t.id === item.taskId);
    if (task) setModal({ type: 'edit-task', task });
    else toast.error('No se encontró la definición de la tarea');
  };
  const handleRemove = (item: MaintenancePlanItem) => setModal({ type: 'confirm-remove', item });

  return (
    <>
    <div className="flex h-full min-h-0 overflow-hidden">
      {/* ── Aircraft list sidebar ── */}
      <aside className="w-64 shrink-0 border-r border-slate-200 bg-white flex flex-col overflow-hidden">
        <div className="px-4 pt-6 pb-3 shrink-0">
          <h2 className="text-sm font-bold text-slate-900">Plan de Mantenimiento</h2>
          <p className="text-xs text-slate-400 mt-0.5">Selecciona una aeronave</p>
        </div>
        <div className="px-3 pb-3 shrink-0">
          <div className="relative">
            <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            <input
              type="text"
              placeholder="Buscar matrícula…"
              className="filter-input pl-8 w-full text-[12px]"
              onChange={e => {
                const q = e.target.value.toLowerCase();
                setSearch(selectedId ? search : q);
              }}
            />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-2 pb-3">
          {loadingAircraft && (
            <p className="text-center py-8 text-xs text-slate-400">Cargando…</p>
          )}
          {allAircraft.map(a => {
            const h = healthMap.get(a.id);
            const isSelected = a.id === selectedId;
            return (
              <button
                key={a.id}
                onClick={() => setSelectedId(a.id)}
                className={`w-full text-left px-3 py-2.5 rounded-lg mb-0.5 transition-colors group ${
                  isSelected
                    ? 'bg-brand-50 border border-brand-200'
                    : 'hover:bg-slate-50 border border-transparent'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-[13px] font-bold text-slate-900 truncate">{a.registration}</span>
                  <div className="flex gap-1 shrink-0">
                    {h?.overdue  ? <span className="w-4 h-4 rounded-full bg-rose-500   text-white text-[9px] font-bold flex items-center justify-center">{h.overdue}</span>  : null}
                    {h?.dueSoon  ? <span className="w-4 h-4 rounded-full bg-amber-400  text-white text-[9px] font-bold flex items-center justify-center">{h.dueSoon}</span>  : null}
                  </div>
                </div>
                <p className="text-[11px] text-slate-400 truncate mt-0.5">{a.manufacturer} · {a.model}</p>
                <div className="flex items-center gap-1 mt-1">
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                    a.status === 'OPERATIONAL'    ? 'bg-emerald-50 text-emerald-700' :
                    a.status === 'AOG'            ? 'bg-rose-50 text-rose-700' :
                    a.status === 'IN_MAINTENANCE' ? 'bg-blue-50 text-blue-700' :
                    a.status === 'GROUNDED'       ? 'bg-amber-50 text-amber-700' :
                    'bg-slate-100 text-slate-500'
                  }`}>{a.status.replace('_', ' ')}</span>
                </div>
              </button>
            );
          })}
        </div>
      </aside>

      {/* ── Main content ── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {!selectedAircraft ? (
          <div className="flex-1 flex flex-col items-center justify-center text-slate-400 gap-3">
            <ClipboardCheck size={40} strokeWidth={1.5} className="text-slate-300" />
            <p className="text-sm font-medium">Selecciona una aeronave para ver su plan</p>
          </div>
        ) : (
          <div className="flex flex-col h-full overflow-hidden">
            {/* Header */}
            <div className="px-8 pt-7 pb-5 shrink-0 border-b border-slate-100">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2 text-xs text-slate-400 mb-1">
                    <span>Plan de Mantenimiento</span>
                    <ChevronRight size={11} />
                    <span className="font-semibold text-slate-600">{selectedAircraft.registration}</span>
                  </div>
                  <h1 className="text-xl font-bold text-slate-900">{selectedAircraft.registration}</h1>
                  <p className="text-sm text-slate-500 mt-0.5">
                    {selectedAircraft.manufacturer} {selectedAircraft.model} · {selectedAircraft.totalFlightHours.toFixed(0)}h / {selectedAircraft.totalCycles} cic.
                  </p>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <div className="text-right">
                    <p className="text-[10px] text-slate-400 uppercase tracking-widest font-semibold">Tareas asignadas</p>
                    <p className="text-3xl font-bold text-slate-900 tabular-nums">{planItems.length}</p>
                  </div>
                  <button
                    onClick={() => setModal({ type: 'assign-task' })}
                    className="btn-primary gap-1.5"
                  >
                    <Plus size={15} />
                    Agregar tarea
                  </button>
                </div>
              </div>

              {/* Summary cards */}
              {planItems.length > 0 && (
                <div className="mt-5">
                  <SummaryBar items={planItems} />
                </div>
              )}
            </div>

            {/* Filters */}
            <div className="px-8 py-3 shrink-0 border-b border-slate-100 bg-slate-50/60">
              <div className="flex items-center gap-2.5 flex-wrap">
                <div className="relative">
                  <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                  <input
                    type="text"
                    placeholder="Buscar tarea…"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    className="filter-input pl-8 w-48"
                  />
                </div>
                <select
                  value={filterStatus}
                  onChange={e => setFilterStatus(e.target.value as PlanItemStatus | '')}
                  className="filter-input cursor-pointer"
                >
                  <option value="">Todos los estados</option>
                  <option value="OVERDUE">Vencidas</option>
                  <option value="DUE_SOON">Próx. vencer</option>
                  <option value="OK">Al día</option>
                  <option value="NEVER_PERFORMED">Sin registro</option>
                </select>
                {(search || filterStatus) && (
                  <button
                    onClick={() => { setSearch(''); setFilterStatus(''); }}
                    className="text-xs text-brand-600 hover:text-brand-700 font-semibold transition-colors"
                  >
                    Limpiar
                  </button>
                )}
                <span className="ml-auto text-xs text-slate-400">
                  {filteredPlan.length} tarea{filteredPlan.length !== 1 ? 's' : ''}
                </span>
              </div>
            </div>

            {/* Table */}
            <div className="flex-1 overflow-auto">
              {loadingPlan ? (
                <div className="flex items-center justify-center h-40 text-sm text-slate-400">
                  Cargando plan de mantenimiento…
                </div>
              ) : filteredPlan.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-40 gap-2 text-slate-400">
                  <ClipboardCheck size={28} strokeWidth={1.5} className="text-slate-300" />
                  <p className="text-sm">
                    {planItems.length === 0 ? 'Esta aeronave no tiene tareas asignadas' : 'No hay tareas que coincidan con los filtros'}
                  </p>
                  {planItems.length === 0 && (
                    <button onClick={() => setModal({ type: 'assign-task' })} className="btn-secondary text-xs gap-1 mt-1">
                      <Plus size={13} /> Agregar primera tarea
                    </button>
                  )}
                </div>
              ) : (
                <table className="min-w-full text-sm">
                  <thead className="bg-white sticky top-0 z-10 border-b border-slate-200">
                    <tr>
                      <th className="px-4 py-3 w-8" />
                      <th className="table-header">Tarea</th>
                      <th className="table-header">Intervalo</th>
                      <th className="table-header">Próx. vencimiento</th>
                      <th className="table-header">Último cumplimiento</th>
                      <th className="table-header text-right">H-H est.</th>
                      <th className="table-header text-right">Estado</th>
                      <th className="px-4 py-3 w-28" />
                    </tr>
                  </thead>
                  <tbody>
                    {filteredPlan.map(item => (
                      <TaskRow
                        key={item.taskId}
                        item={item}
                        onRecord={handleRecord}
                        onEdit={handleEdit}
                        onRemove={handleRemove}
                      />
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}
      </div>
    </div>

    {/* ── Modals ── */}
    {modal?.type === 'record-compliance' && (
      <RecordComplianceModal
        item={modal.item}
        aircraftId={selectedId!}
        onClose={() => setModal(null)}
        onSubmit={input => recordMutation.mutate(input)}
        isPending={recordMutation.isPending}
      />
    )}
    {modal?.type === 'assign-task' && (
      <AssignTaskModal
        aircraftId={selectedId!}
        assignedTaskIds={assignedTaskIds}
        onClose={() => setModal(null)}
        onAssign={taskId => assignMutation.mutate(taskId)}
        onCreateNew={() => setModal({ type: 'create-task' })}
        isPending={assignMutation.isPending}
      />
    )}
    {(modal?.type === 'create-task' || modal?.type === 'edit-task') && (
      <CreateEditTaskModal
        task={modal.type === 'edit-task' ? modal.task : null}
        onClose={() => setModal(null)}
        onCreate={input => createTaskMutation.mutate(input)}
        onUpdate={(id, input) => updateTaskMutation.mutate({ id, input })}
        isPending={createTaskMutation.isPending || updateTaskMutation.isPending}
      />
    )}
    {modal?.type === 'confirm-remove' && (
      <ConfirmRemoveModal
        item={modal.item}
        registration={selectedAircraftReg}
        onClose={() => setModal(null)}
        onConfirm={() => removeMutation.mutate(modal.item.taskId)}
        isPending={removeMutation.isPending}
      />
    )}
    </>
  );
}

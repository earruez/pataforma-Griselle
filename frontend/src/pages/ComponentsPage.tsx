import { Fragment, useEffect, useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import { componentApi, type CreateComponentInput } from '@api/component.api';
import { aircraftApi } from '@api/aircraft.api';
import { maintenancePlanApi } from '@api/maintenancePlan.api';
import { complianceApi } from '@api/compliance.api';
import { libraryApi } from '@api/library.api';
import { Package, ChevronDown, X, Loader2, ChevronRight } from 'lucide-react';
import { componentChapterLabel, isComponentChapterTask, isComponentTaskCode } from '@/shared/componentChapterRules';
import type { MaintenancePlanItem } from '@api/maintenancePlan.api';
import { createSTFromSource } from '@/shared/createSTFromSource';
import { useWorkRequestStore } from '../store/workRequestStore';
import { isActiveWorkRequestStatus } from '@/shared/workRequestTypes';

function RemainingCell({ tbo, used }: { tbo: number | null; used: number | null }) {
  if (tbo == null || used == null) return <td className="table-cell text-slate-400">—</td>;
  const rem = tbo - used;
  if (rem <= 0) return <td className="table-cell font-semibold text-rose-600">VENCIDO</td>;
  const pct = used / tbo;
  const color = pct >= 0.9 ? 'text-rose-600' : pct >= 0.75 ? 'text-amber-600' : 'text-emerald-700';
  return <td className={`table-cell tabular-nums font-medium ${color}`}>{rem.toFixed(1)}</td>;
}

// ── Modal ──────────────────────────────────────────────────────────────────

function NewComponentModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const { data: aircraft = [] } = useQuery({ queryKey: ['aircraft'], queryFn: aircraftApi.findAll });
  const [form, setForm] = useState<CreateComponentInput>({
    partNumber: '',
    serialNumber: '',
    description: '',
    manufacturer: '',
    aircraftId: null,
    position: null,
    tboHours: null,
    tboCycles: null,
  });

  const mutation = useMutation({
    mutationFn: componentApi.create,
    onSuccess: () => {
      toast.success('Componente creado correctamente');
      qc.invalidateQueries({ queryKey: ['components'] });
      onClose();
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Error al crear componente';
      toast.error(msg);
    },
  });

  const set = <K extends keyof CreateComponentInput>(field: K, value: CreateComponentInput[K]) =>
    setForm(p => ({ ...p, [field]: value }));

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.partNumber.trim() || !form.serialNumber.trim() || !form.description.trim() || !form.manufacturer.trim()) {
      toast.error('P/N, N/S, Descripción y Fabricante son obligatorios');
      return;
    }
    mutation.mutate(form);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg bg-white rounded-2xl shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <div className="flex items-center gap-2">
            <Package size={16} className="text-brand-600" />
            <h2 className="text-base font-bold text-slate-900">Nuevo Componente</h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors">
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="form-label">Nombre / Descripción <span className="text-rose-500">*</span></label>
            <input
              value={form.description}
              onChange={e => set('description', e.target.value)}
              className="filter-input w-full"
              placeholder="Ej: Motor turbofan izquierdo"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="form-label">P/N (Part Number) <span className="text-rose-500">*</span></label>
              <input
                value={form.partNumber}
                onChange={e => set('partNumber', e.target.value)}
                className="filter-input w-full"
                placeholder="CFM56-7B27"
              />
            </div>
            <div>
              <label className="form-label">N/S (Serial Number) <span className="text-rose-500">*</span></label>
              <input
                value={form.serialNumber}
                onChange={e => set('serialNumber', e.target.value)}
                className="filter-input w-full"
                placeholder="9834GH"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="form-label">Fabricante <span className="text-rose-500">*</span></label>
              <input
                value={form.manufacturer}
                onChange={e => set('manufacturer', e.target.value)}
                className="filter-input w-full"
                placeholder="CFM International"
              />
            </div>
            <div>
              <label className="form-label">Posición</label>
              <input
                value={form.position ?? ''}
                onChange={e => set('position', e.target.value || null)}
                className="filter-input w-full"
                placeholder="Ej: Motor 1"
              />
            </div>
          </div>

          <div>
            <label className="form-label">Aeronave Asociada</label>
            <div className="relative">
              <select
                value={form.aircraftId ?? ''}
                onChange={e => set('aircraftId', e.target.value || null)}
                className="filter-input w-full pr-8 appearance-none"
              >
                <option value="">Sin aeronave (en almacén)</option>
                {aircraft.map(a => (
                  <option key={a.id} value={a.id}>{a.registration} — {a.model}</option>
                ))}
              </select>
              <ChevronDown size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="form-label">Límite TBO (horas)</label>
              <input
                type="number"
                min={0}
                step={1}
                value={form.tboHours ?? ''}
                onChange={e => set('tboHours', e.target.value ? parseFloat(e.target.value) : null)}
                className="filter-input w-full"
                placeholder="Ej: 20000"
              />
            </div>
            <div>
              <label className="form-label">Límite TBO (ciclos)</label>
              <input
                type="number"
                min={0}
                step={1}
                value={form.tboCycles ?? ''}
                onChange={e => set('tboCycles', e.target.value ? parseInt(e.target.value) : null)}
                className="filter-input w-full"
                placeholder="Ej: 15000"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary">Cancelar</button>
            <button
              type="submit"
              disabled={mutation.isPending}
              className="btn-primary flex items-center gap-1.5"
            >
              {mutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <Package size={14} />}
              Guardar Componente
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function addMonths(base: Date, months: number): Date {
  const d = new Date(base);
  d.setMonth(d.getMonth() + months);
  return d;
}

function AddComponentRecordModal({
  task,
  aircraftId,
  aircraftHours,
  aircraftCycles,
  existingComponents,
  onClose,
  onSaved,
}: {
  task: MaintenancePlanItem;
  aircraftId: string;
  aircraftHours: number;
  aircraftCycles: number;
  existingComponents: Array<{ id: string; partNumber: string; serialNumber: string; description: string; manufacturer: string | null; position: string | null }>;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [selectedComponentId, setSelectedComponentId] = useState(existingComponents[0]?.id ?? '');
  const [partNumber, setPartNumber] = useState(existingComponents[0]?.partNumber ?? '');
  const [serialNumber, setSerialNumber] = useState(existingComponents[0]?.serialNumber ?? '');
  const [description, setDescription] = useState(existingComponents[0]?.description ?? task.taskTitle);
  const [manufacturer, setManufacturer] = useState(existingComponents[0]?.manufacturer ?? 'GENERIC');
  const [position, setPosition] = useState(existingComponents[0]?.position ?? 'ENGINE 1');
  const [installedAt, setInstalledAt] = useState(new Date().toISOString().slice(0, 16));
  const [flightHoursAtCompliance, setFlightHoursAtCompliance] = useState(String(aircraftHours.toFixed(1)));
  const [workOrderNumber, setWorkOrderNumber] = useState('');
  const [notes, setNotes] = useState('Registro de ultima instalacion desde Componentes');

  const selectedExistingComponent = existingComponents.find((c) => c.id === selectedComponentId) ?? null;

  useEffect(() => {
    if (!selectedExistingComponent) return;
    setPartNumber(selectedExistingComponent.partNumber ?? '');
    setSerialNumber(selectedExistingComponent.serialNumber ?? '');
    setDescription(selectedExistingComponent.description ?? task.taskTitle);
    setManufacturer(selectedExistingComponent.manufacturer ?? 'GENERIC');
    setPosition(selectedExistingComponent.position ?? 'ENGINE 1');
  }, [selectedExistingComponent, task.taskTitle]);

  const preview = useMemo(() => {
    const baseDate = new Date(installedAt);
    const hours = Number(flightHoursAtCompliance);
    if (Number.isNaN(baseDate.getTime())) {
      return { nextHours: null as number | null, nextCycles: null as number | null, nextDate: null as Date | null };
    }
    const nextHours = Number.isFinite(hours) && task.intervalHours != null
      ? hours + task.intervalHours
      : null;
    const nextCycles = task.intervalCycles != null ? aircraftCycles + task.intervalCycles : null;
    let nextDate: Date | null = null;
    if (task.intervalCalendarDays != null) {
      nextDate = new Date(baseDate.getTime() + task.intervalCalendarDays * 24 * 60 * 60 * 1000);
    } else if (task.intervalCalendarMonths != null) {
      nextDate = addMonths(baseDate, task.intervalCalendarMonths);
    }
    return { nextHours, nextCycles, nextDate };
  }, [installedAt, flightHoursAtCompliance, task, aircraftCycles]);

  const mutation = useMutation({
    mutationFn: async () => {
      const installDateIso = new Date(installedAt).toISOString();
      const hours = Number(flightHoursAtCompliance);
      if (Number.isNaN(new Date(installDateIso).getTime())) {
        throw new Error('Fecha y hora de instalacion invalida');
      }
      if (!Number.isFinite(hours) || hours < 0) {
        throw new Error('Horas de vuelo invalidas');
      }

      const componentId = selectedComponentId;
      if (!componentId) {
        throw new Error('Selecciona un componente');
      }

      if (!partNumber.trim() || !serialNumber.trim()) {
        throw new Error('P/N y S/N son obligatorios');
      }

      await componentApi.update(componentId, {
        partNumber: partNumber.trim(),
        serialNumber: serialNumber.trim(),
        description: description.trim() || task.taskTitle,
        manufacturer: manufacturer.trim() || 'GENERIC',
        position: position.trim() || null,
      });

      await componentApi.updateInstallation(componentId, {
        aircraftId,
        installationDate: installDateIso,
        position: position.trim() || selectedExistingComponent?.position || null,
        notes: notes.trim() || null,
      });

      await complianceApi.record({
        aircraftId,
        taskId: task.taskId,
        componentId,
        performedAt: installDateIso,
        aircraftHoursAtCompliance: hours,
        nextDueHours: preview.nextHours,
        nextDueCycles: preview.nextCycles,
        nextDueDate: preview.nextDate ? preview.nextDate.toISOString() : null,
        workOrderNumber: workOrderNumber.trim() || null,
        notes: notes.trim() || null,
      });
    },
    onSuccess: () => {
      toast.success('Registro de instalacion guardado y proximo cumplimiento actualizado');
      onSaved();
      onClose();
    },
    onError: (err: unknown) => {
      const msg = (err as { message?: string; response?: { data?: { message?: string } } })?.response?.data?.message
        ?? (err as { message?: string })?.message
        ?? 'No se pudo guardar el registro';
      toast.error(msg);
    },
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-2xl bg-white rounded-2xl shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <div>
            <h2 className="text-base font-bold text-slate-900">Registro de instalacion de componente</h2>
            <p className="text-xs text-slate-500 mt-0.5 font-mono">{task.taskCode}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors">
            <X size={16} />
          </button>
        </div>

        <div className="p-6 space-y-4 max-h-[80vh] overflow-y-auto">
          <div className="rounded-lg bg-slate-50 border border-slate-200 p-3">
            <p className="text-sm font-semibold text-slate-800">{task.taskTitle}</p>
            <p className="text-xs text-slate-500 mt-1">Intervalo de reemplazo: {
              [
                task.intervalHours ? `${task.intervalHours} h` : null,
                task.intervalCycles ? `${task.intervalCycles} cic` : null,
                task.intervalCalendarDays ? `${task.intervalCalendarDays} d` : null,
                task.intervalCalendarMonths ? `${task.intervalCalendarMonths} m` : null,
              ].filter(Boolean).join(' / ') || '—'
            }</p>
          </div>

          {existingComponents.length === 0 ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              No hay componentes creados para asociar. Primero crea el componente y luego registra esta mantencion.
            </div>
          ) : (
            <>
              <div>
                <label className="form-label">Componente</label>
                <select
                  className="filter-input w-full"
                  value={selectedComponentId}
                  onChange={(e) => setSelectedComponentId(e.target.value)}
                >
                  <option value="">Seleccionar componente</option>
                  {existingComponents.map((c) => (
                    <option key={c.id} value={c.id}>{c.partNumber} / {c.serialNumber} - {c.description}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="form-label">P/N (Part Number)</label>
                  <input value={partNumber} onChange={(e) => setPartNumber(e.target.value)} className="filter-input w-full" />
                </div>
                <div>
                  <label className="form-label">S/N (Serial Number)</label>
                  <input value={serialNumber} onChange={(e) => setSerialNumber(e.target.value)} className="filter-input w-full" />
                </div>
                <div>
                  <label className="form-label">Descripcion</label>
                  <input value={description} onChange={(e) => setDescription(e.target.value)} className="filter-input w-full" />
                </div>
                <div>
                  <label className="form-label">Fabricante</label>
                  <input value={manufacturer} onChange={(e) => setManufacturer(e.target.value)} className="filter-input w-full" />
                </div>
              </div>
            </>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="form-label">Ultima instalacion (fecha y hora)</label>
              <input
                type="datetime-local"
                value={installedAt}
                onChange={(e) => setInstalledAt(e.target.value)}
                className="filter-input w-full"
              />
            </div>
            <div>
              <label className="form-label">Horas de vuelo aeronave (cumplimiento)</label>
              <input
                type="number"
                min={0}
                step="0.1"
                value={flightHoursAtCompliance}
                onChange={(e) => setFlightHoursAtCompliance(e.target.value)}
                className="filter-input w-full"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="form-label">Posicion</label>
              <input value={position} onChange={(e) => setPosition(e.target.value)} className="filter-input w-full" placeholder="ENGINE 1" />
            </div>
            <div>
              <label className="form-label">Ciclos aeronave (referencia actual)</label>
              <input value={String(aircraftCycles)} disabled className="filter-input w-full bg-slate-50 text-slate-500" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="form-label">N° Orden de trabajo</label>
              <input value={workOrderNumber} onChange={(e) => setWorkOrderNumber(e.target.value)} className="filter-input w-full" />
            </div>
            <div>
              <label className="form-label">Notas</label>
              <input value={notes} onChange={(e) => setNotes(e.target.value)} className="filter-input w-full" />
            </div>
          </div>

          <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3">
            <p className="text-xs font-semibold text-emerald-700 uppercase tracking-wide">Proximo cumplimiento (calculado automaticamente)</p>
            <p className="text-sm text-emerald-800 mt-1">
              {[
                preview.nextHours != null ? `${preview.nextHours.toFixed(1)} h` : null,
                preview.nextCycles != null ? `${preview.nextCycles} cic` : null,
                preview.nextDate != null ? preview.nextDate.toLocaleString('es-MX') : null,
              ].filter(Boolean).join(' / ') || 'No aplica'}
            </p>
          </div>
        </div>

        <div className="flex justify-end gap-2 px-6 py-4 border-t border-slate-200">
          <button type="button" className="btn-secondary" onClick={onClose}>Cancelar</button>
          <button
            type="button"
            className="btn-primary"
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending || existingComponents.length === 0}
          >
            {mutation.isPending ? 'Guardando…' : 'Guardar registro'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function ComponentsPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [showModal, setShowModal] = useState(false);
  const [selectedTaskForRecord, setSelectedTaskForRecord] = useState<MaintenancePlanItem | null>(null);
  const [expandedComponentId, setExpandedComponentId] = useState<string | null>(null);
  const [componentSearch, setComponentSearch] = useState('');
  const [componentTaskSearch, setComponentTaskSearch] = useState('');
  const [params, setParams] = useSearchParams();
  const selectedAircraft = params.get('aircraft') ?? '';
  const workRequests = useWorkRequestStore((s) => s.workRequests);
  const selectWorkRequest = useWorkRequestStore((s) => s.selectWorkRequest);

  const { data: aircraft = [] } = useQuery({ queryKey: ['aircraft'], queryFn: aircraftApi.findAll });
  const { data: components = [], isLoading } = useQuery({
    queryKey: ['components', selectedAircraft],
    queryFn: () => selectedAircraft ? componentApi.findByAircraft(selectedAircraft) : componentApi.findAll(),
  });
  const { data: componentHistory = [], isLoading: loadingComponentHistory } = useQuery({
    queryKey: ['component-compliance-history', expandedComponentId],
    queryFn: () => componentApi.getComplianceHistory(expandedComponentId!),
    enabled: !!expandedComponentId,
    staleTime: 0,
  });
  const { data: planItems = [], isLoading: loadingPlanTasks } = useQuery({
    queryKey: ['components-plan-items', selectedAircraft],
    queryFn: () => maintenancePlanApi.getForAircraft(selectedAircraft),
    enabled: !!selectedAircraft,
    staleTime: 0,
  });
  const { data: templates = [] } = useQuery({
    queryKey: ['library-templates-for-components'],
    queryFn: libraryApi.findAll,
    staleTime: 60_000,
  });

  const selectedAircraftData = aircraft.find((a) => a.id === selectedAircraft) ?? null;

  const templateComponentCodes = new Set(
    templates
      .filter((template) =>
        selectedAircraftData
        && template.manufacturer.toUpperCase() === selectedAircraftData.manufacturer.toUpperCase()
        && template.model.toUpperCase() === selectedAircraftData.model.toUpperCase(),
      )
      .flatMap((template) => template.tasks ?? [])
      .filter((task) => isComponentChapterTask({ chapter: task.chapter, section: task.section, taskCode: task.code }))
      .map((task) => task.code),
  );

  const componentChapterTasks = planItems.filter((item) =>
    templateComponentCodes.has(item.taskCode) || isComponentTaskCode(item.taskCode),
  );

  const filteredComponentChapterTasks = useMemo(() => {
    const q = componentTaskSearch.trim().toLowerCase();
    if (!q) return componentChapterTasks;

    return componentChapterTasks.filter((item) => {
      const text = [
        item.taskCode,
        item.taskTitle,
        item.referenceType,
        item.referenceNumber ?? '',
      ]
        .join(' ')
        .toLowerCase();
      return text.includes(q);
    });
  }, [componentChapterTasks, componentTaskSearch]);

  const filteredComponents = useMemo(() => {
    const q = componentSearch.trim().toLowerCase();
    if (!q) return components;

    return components.filter((c) => {
      const text = [
        c.partNumber,
        c.serialNumber,
        c.description,
        c.manufacturer ?? '',
        c.position ?? '',
      ]
        .join(' ')
        .toLowerCase();
      return text.includes(q);
    });
  }, [components, componentSearch]);

  const openSTByComponentId = useMemo(() => {
    const map = new Map<string, { id: string }>();
    for (const wr of workRequests) {
      if (!isActiveWorkRequestStatus(wr.status)) continue;
      for (const item of wr.items) {
        if (item.sourceKind === 'component_inspection' && item.sourceId) {
          map.set(item.sourceId, { id: wr.id });
        }
      }
    }
    return map;
  }, [workRequests]);

  const replacementIntervalLabel = (item: { intervalHours: number | null; intervalCycles: number | null; intervalCalendarDays: number | null; intervalCalendarMonths: number | null; }) => {
    const parts: string[] = [];
    if (item.intervalHours != null && item.intervalHours > 0) parts.push(`${item.intervalHours} h`);
    if (item.intervalCycles != null && item.intervalCycles > 0) parts.push(`${item.intervalCycles} cic`);
    if (item.intervalCalendarDays != null && item.intervalCalendarDays > 0) parts.push(`${item.intervalCalendarDays} d`);
    if (item.intervalCalendarMonths != null && item.intervalCalendarMonths > 0) parts.push(`${item.intervalCalendarMonths} m`);
    return parts.length > 0 ? parts.join(' / ') : '—';
  };

  return (
    <div className="p-8 space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-brand-50 rounded-lg flex items-center justify-center">
            <Package size={18} className="text-brand-600" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900">Componentes (EQ)</h1>
            <p className="text-sm text-slate-500">Trazabilidad de componentes y límites TBO</p>
          </div>
        </div>
        <button className="btn-primary" onClick={() => setShowModal(true)}>+ Nuevo componente</button>
      </div>

      {/* Filter */}
      <div className="filter-bar">
        <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest shrink-0">Aeronave</label>
        <div className="relative">
          <select
            value={selectedAircraft}
            onChange={(e) => setParams(e.target.value ? { aircraft: e.target.value } : {})}
            className="filter-input pr-8 min-w-48 appearance-none cursor-pointer"
          >
            <option value="">Todas</option>
            {aircraft.map((a) => (
              <option key={a.id} value={a.id}>{a.registration} — {a.model}</option>
            ))}
          </select>
          <ChevronDown size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
        </div>
        <input
          type="text"
          value={componentSearch}
          onChange={(e) => setComponentSearch(e.target.value)}
          placeholder="Buscar componente (P/N, S/N, descripción...)"
          className="filter-input min-w-72"
        />
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-card overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-100 text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="table-header">P/N</th>
              <th className="table-header">S/N</th>
              <th className="table-header">Descripción</th>
              <th className="table-header">Posición</th>
              <th className="table-header text-right">H desde nuevo</th>
              <th className="table-header text-right">H desde overhaul</th>
              <th className="table-header text-right">TBO (h)</th>
              <th className="table-header text-right">Remanente (h)</th>
              <th className="table-header">Instalación</th>
              <th className="table-header text-center">ST</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {isLoading && (
              <tr><td colSpan={10} className="table-cell text-center text-slate-400 py-12">Cargando…</td></tr>
            )}
            {!isLoading && filteredComponents.length === 0 && (
              <tr><td colSpan={10} className="table-cell text-center text-slate-400 py-12">No hay componentes registrados</td></tr>
            )}
            {filteredComponents.map((c) => {
              const st = openSTByComponentId.get(c.id) ?? null;
              return (
                <Fragment key={c.id}>
                  <tr
                    className="hover:bg-slate-50 transition-colors cursor-pointer"
                    onClick={() => setExpandedComponentId((prev) => (prev === c.id ? null : c.id))}
                    title="Click para ver trazabilidad de mantenciones"
                  >
                    <td className="table-cell font-mono text-xs text-slate-700">
                      <span className="inline-flex items-center gap-1.5">
                        <ChevronRight
                          size={14}
                          className={`text-slate-400 transition-transform ${expandedComponentId === c.id ? 'rotate-90' : ''}`}
                        />
                        {c.partNumber}
                      </span>
                    </td>
                    <td className="table-cell font-mono text-xs text-slate-700">{c.serialNumber}</td>
                    <td className="table-cell text-slate-700">{c.description}</td>
                    <td className="table-cell text-slate-500">{c.position ?? '—'}</td>
                    <td className="table-cell text-right tabular-nums">{c.totalHoursSinceNew != null ? Number(c.totalHoursSinceNew).toFixed(1) : '—'}</td>
                    <td className="table-cell text-right tabular-nums">{c.hoursSinceOverhaul != null ? Number(c.hoursSinceOverhaul).toFixed(1) : '—'}</td>
                    <td className="table-cell text-right tabular-nums">{c.tboHours != null ? c.tboHours : '—'}</td>
                    <RemainingCell tbo={c.tboHours} used={c.hoursSinceOverhaul ?? c.totalHoursSinceNew} />
                    <td className="table-cell text-xs text-slate-500">
                      {c.installationDate ? new Date(c.installationDate).toLocaleDateString('es-MX') : '—'}
                    </td>
                    <td className="table-cell text-center">
                      {st ? (
                        <button
                          className="btn-secondary btn-xs"
                          onClick={e => {
                            e.stopPropagation();
                            selectWorkRequest(st.id, 'general');
                            navigate(`/work-requests?aircraftId=${encodeURIComponent(c.aircraftId ?? selectedAircraft)}&stId=${st.id}`);
                          }}
                        >
                          Ver ST
                        </button>
                      ) : (
                        <button
                          className="btn-primary btn-xs"
                          onClick={async e => {
                            e.stopPropagation();
                            if (!c.aircraftId) {
                              toast.error('El componente debe estar asociado a una aeronave para agregarlo a ST');
                              return;
                            }

                            const stId = await createSTFromSource('component', {
                              aircraftId: c.aircraftId,
                              sourceId: c.id,
                              ataCode: c.partNumber,
                              title: c.description,
                              description: 'Accion requerida',
                              aircraftHoursAtRequest: selectedAircraftData?.totalFlightHours ?? 0,
                              aircraftCyclesAtRequest: selectedAircraftData?.totalCycles ?? 0,
                              priority: 'media',
                            });

                            selectWorkRequest(stId, 'general');
                            navigate(`/work-requests?aircraftId=${encodeURIComponent(c.aircraftId)}&stId=${stId}`);
                          }}
                        >
                          Agregar a ST
                        </button>
                      )}
                    </td>
                  </tr>
                {expandedComponentId === c.id && (
                  <tr className="bg-slate-50/70">
                    <td colSpan={10} className="px-5 py-4">
                      <p className="text-xs font-semibold text-slate-700 mb-2">Trazabilidad de mantenciones</p>
                      {loadingComponentHistory ? (
                        <p className="text-xs text-slate-400">Cargando historial…</p>
                      ) : componentHistory.length === 0 ? (
                        <p className="text-xs text-slate-400">Sin mantenciones registradas para este componente.</p>
                      ) : (
                        <div className="space-y-2">
                          {componentHistory.map((h) => (
                            <div key={h.id} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs">
                              <div className="flex items-center justify-between gap-3">
                                <p className="font-mono text-slate-700">{h.task.code}</p>
                                <p className="text-slate-400">{new Date(h.performedAt).toLocaleString('es-MX')}</p>
                              </div>
                              <p className="text-slate-600 mt-0.5">{h.task.title}</p>
                              <p className="text-slate-500 mt-1">
                                Hrs cumplimiento: {Number(h.aircraftHoursAtCompliance).toFixed(1)}
                                {h.nextDueHours != null ? ` · Próximo: ${Number(h.nextDueHours).toFixed(1)} h` : ''}
                                {h.nextDueDate ? ` · ${new Date(h.nextDueDate).toLocaleDateString('es-MX')}` : ''}
                              </p>
                            </div>
                          ))}
                        </div>
                      )}
                    </td>
                  </tr>
                )}
              </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-card overflow-x-auto">
        <div className="px-5 py-4 border-b border-slate-100">
          <h2 className="text-sm font-bold text-slate-900">Tareas de Componente desde Plan</h2>
          <p className="text-xs text-slate-500 mt-1">
            Capítulos considerados de componente: {componentChapterLabel}
          </p>
          <div className="mt-3">
            <input
              type="text"
              value={componentTaskSearch}
              onChange={(e) => setComponentTaskSearch(e.target.value)}
              placeholder="Buscar tarea de componente (código, descripción, referencia...)"
              className="filter-input w-full md:w-96"
            />
          </div>
        </div>
        {!selectedAircraft ? (
          <div className="px-5 py-10 text-sm text-slate-400 text-center">
            Selecciona una aeronave para ver sus tareas de componente.
          </div>
        ) : loadingPlanTasks ? (
          <div className="px-5 py-10 text-sm text-slate-400 text-center">Cargando tareas de componente...</div>
        ) : filteredComponentChapterTasks.length === 0 ? (
          <div className="px-5 py-10 text-sm text-slate-400 text-center">
            No hay tareas del plan en los capítulos de componente para esta aeronave.
          </div>
        ) : (
          <table className="min-w-full divide-y divide-slate-100 text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="table-header">Tarea</th>
                <th className="table-header">Descripción</th>
                <th className="table-header">Intervalo de reemplazo</th>
                <th className="table-header">Próximo cumplimiento</th>
                <th className="table-header">Referencia</th>
                <th className="table-header">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredComponentChapterTasks.map((item) => (
                <tr
                  key={item.taskId}
                  className="hover:bg-slate-50 transition-colors cursor-pointer"
                  onClick={() => setSelectedTaskForRecord(item)}
                  title="Click para asignar componente y registrar instalación"
                >
                  <td className="table-cell font-mono text-xs text-slate-700">{item.taskCode}</td>
                  <td className="table-cell text-slate-700">{item.taskTitle}</td>
                  <td className="table-cell text-xs text-slate-600">{replacementIntervalLabel(item)}</td>
                  <td className="table-cell text-xs text-slate-600">
                    {[
                      item.nextDueHours != null ? `${item.nextDueHours.toFixed(1)} h` : null,
                      item.nextDueCycles != null ? `${item.nextDueCycles} cic` : null,
                      item.nextDueDate ? new Date(item.nextDueDate).toLocaleDateString('es-MX') : null,
                    ].filter(Boolean).join(' / ') || '—'}
                  </td>
                  <td className="table-cell text-xs text-slate-500">
                    {item.referenceType} {item.referenceNumber ?? ''}
                  </td>
                  <td className="table-cell">
                    <span className={
                      item.status === 'OVERDUE'
                        ? 'badge-overdue'
                        : item.status === 'DUE_SOON'
                          ? 'badge-deferred'
                          : item.status === 'OK'
                            ? 'badge-operational'
                            : 'badge-decommissioned'
                    }>
                      {item.status === 'OVERDUE'
                        ? 'VENCIDA'
                        : item.status === 'DUE_SOON'
                          ? 'PROXIMA'
                          : item.status === 'OK'
                            ? 'AL DIA'
                            : 'SIN REGISTRO'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showModal && <NewComponentModal onClose={() => setShowModal(false)} />}
      {selectedTaskForRecord && selectedAircraftData && (
        <AddComponentRecordModal
          task={selectedTaskForRecord}
          aircraftId={selectedAircraftData.id}
          aircraftHours={selectedAircraftData.totalFlightHours}
          aircraftCycles={selectedAircraftData.totalCycles}
          existingComponents={components}
          onClose={() => setSelectedTaskForRecord(null)}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: ['components', selectedAircraft] });
            qc.invalidateQueries({ queryKey: ['components-plan-items', selectedAircraft] });
            qc.invalidateQueries({ queryKey: ['maintenance-plan', selectedAircraft] });
          }}
        />
      )}
    </div>
  );
}

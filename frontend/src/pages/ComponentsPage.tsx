import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import { componentApi, type CreateComponentInput } from '@api/component.api';
import { aircraftApi } from '@api/aircraft.api';
import { Package, ChevronDown, X, Loader2 } from 'lucide-react';

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

export default function ComponentsPage() {
  const [showModal, setShowModal] = useState(false);
  const [params, setParams] = useSearchParams();
  const selectedAircraft = params.get('aircraft') ?? '';

  const { data: aircraft = [] } = useQuery({ queryKey: ['aircraft'], queryFn: aircraftApi.findAll });
  const { data: components = [], isLoading } = useQuery({
    queryKey: ['components', selectedAircraft],
    queryFn: () => selectedAircraft ? componentApi.findByAircraft(selectedAircraft) : componentApi.findAll(),
  });

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
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {isLoading && (
              <tr><td colSpan={9} className="table-cell text-center text-slate-400 py-12">Cargando…</td></tr>
            )}
            {!isLoading && components.length === 0 && (
              <tr><td colSpan={9} className="table-cell text-center text-slate-400 py-12">No hay componentes registrados</td></tr>
            )}
            {components.map((c) => (
              <tr key={c.id} className="hover:bg-slate-50 transition-colors">
                <td className="table-cell font-mono text-xs text-slate-700">{c.partNumber}</td>
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
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showModal && <NewComponentModal onClose={() => setShowModal(false)} />}
    </div>
  );
}

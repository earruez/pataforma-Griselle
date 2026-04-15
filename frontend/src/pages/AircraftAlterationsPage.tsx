import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Plane, Repeat } from 'lucide-react';
import { aircraftApi } from '@api/aircraft.api';
import { aircraftHistoryApi } from '@api/aircraftHistory.api';

export default function AircraftAlterationsPage() {
  const [aircraftId, setAircraftId] = useState('');

  const { data: aircraft = [] } = useQuery({
    queryKey: ['aircraft'],
    queryFn: aircraftApi.findAll,
  });

  const { data: history = [], isFetching } = useQuery({
    queryKey: ['aircraft-alterations', aircraftId],
    queryFn: () => aircraftHistoryApi.getAlterationsByAircraft(aircraftId),
    enabled: !!aircraftId,
  });

  const selectedAircraft = useMemo(
    () => aircraft.find((a) => a.id === aircraftId) ?? null,
    [aircraft, aircraftId],
  );

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 bg-brand-50 rounded-lg flex items-center justify-center">
          <Repeat size={18} className="text-brand-600" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-slate-900">Alteraciones por Aeronave</h1>
          <p className="text-sm text-slate-500">Historial de instalación y remoción de componentes</p>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-5 max-w-2xl">
        <label className="block text-sm font-semibold text-slate-700 mb-2">Aeronave</label>
        <div className="relative">
          <Plane size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <select value={aircraftId} onChange={(e) => setAircraftId(e.target.value)} className="input pl-9">
            <option value="">Seleccione una aeronave</option>
            {aircraft.map((a) => (
              <option key={a.id} value={a.id}>{a.registration} - {a.model}</option>
            ))}
          </select>
        </div>
      </div>

      {selectedAircraft && (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-100 text-sm font-semibold text-slate-700">
            {selectedAircraft.registration} · {history.length} alteraciones registradas
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-slate-600">
                <tr>
                  <th className="text-left px-4 py-2.5">Fecha</th>
                  <th className="text-left px-4 py-2.5">Movimiento</th>
                  <th className="text-left px-4 py-2.5">Componente</th>
                  <th className="text-left px-4 py-2.5">Posición</th>
                  <th className="text-left px-4 py-2.5">OT</th>
                  <th className="text-left px-4 py-2.5">Ejecutado por</th>
                </tr>
              </thead>
              <tbody>
                {isFetching && (
                  <tr><td className="px-4 py-4 text-slate-400" colSpan={6}>Cargando…</td></tr>
                )}
                {!isFetching && history.length === 0 && (
                  <tr><td className="px-4 py-4 text-slate-400" colSpan={6}>Sin alteraciones para esta aeronave.</td></tr>
                )}
                {history.map((row) => (
                  <tr key={row.id} className="border-t border-slate-100">
                    <td className="px-4 py-2.5">{new Date(row.movedAt).toLocaleDateString('es-MX')}</td>
                    <td className="px-4 py-2.5">
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${row.movementType === 'INSTALLED' ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>
                        {row.movementType === 'INSTALLED' ? 'Instalado' : 'Removido'}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 font-mono text-xs">{row.component.partNumber} / {row.component.serialNumber}</td>
                    <td className="px-4 py-2.5">{row.position ?? '-'}</td>
                    <td className="px-4 py-2.5">{row.workOrder?.number ?? '-'}</td>
                    <td className="px-4 py-2.5">{row.performedBy.name}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

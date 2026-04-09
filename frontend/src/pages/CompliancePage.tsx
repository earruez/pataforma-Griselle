import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { aircraftApi } from '@api/aircraft.api';
import { complianceApi, type Compliance } from '@api/compliance.api';

function dueBadge(c: Compliance): { label: string; cls: string } {
  const today = Date.now();
  if (c.deferralReference && c.deferralExpiresAt && new Date(c.deferralExpiresAt).getTime() >= today) {
    return { label: 'DIFERIDA', cls: 'badge-deferred' };
  }
  if (
    (c.nextDueDate && new Date(c.nextDueDate).getTime() < today) ||
    (c.nextDueHours != null && c.aircraft?.totalFlightHours != null && c.nextDueHours < Number(c.aircraft.totalFlightHours)) ||
    (c.nextDueCycles != null && c.aircraft?.totalCycles != null && c.nextDueCycles < c.aircraft.totalCycles)
  ) {
    return { label: 'VENCIDA', cls: 'badge-overdue' };
  }
  return { label: 'AL DÍA', cls: 'badge-completed' };
}

export default function CompliancePage() {
  const [selectedAircraftId, setSelectedAircraftId] = useState<string>('');
  const { data: aircraft = [] } = useQuery({ queryKey: ['aircraft'], queryFn: aircraftApi.findAll });
  const { data: records = [], isLoading } = useQuery({
    queryKey: ['compliance', 'latest', selectedAircraftId],
    queryFn: () => complianceApi.latestForAircraft(selectedAircraftId),
    enabled: !!selectedAircraftId,
  });

  const selected = aircraft.find((a) => a.id === selectedAircraftId);

  return (
    <div className="p-8 space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Cumplimientos</h2>
        <p className="text-sm text-gray-500 mt-1">Estado actual de tareas por aeronave — registro de auditoría aeronáutico</p>
      </div>

      <div className="flex items-center gap-4">
        <label className="text-sm font-medium text-gray-700">Aeronave:</label>
        <select
          value={selectedAircraftId}
          onChange={(e) => setSelectedAircraftId(e.target.value)}
          className="input-base w-auto min-w-60"
        >
          <option value="">— Seleccionar aeronave —</option>
          {aircraft.map((a) => (
            <option key={a.id} value={a.id}>{a.registration} — {a.model}</option>
          ))}
        </select>
        {selected && (
          <span className="text-sm text-gray-500">
            {Number(selected.totalFlightHours).toFixed(1)} h · {selected.totalCycles} ciclos
          </span>
        )}
      </div>

      {!selectedAircraftId && (
        <div className="bg-white rounded-xl shadow-sm p-12 text-center text-gray-400">
          Selecciona una aeronave para ver sus cumplimientos
        </div>
      )}

      {selectedAircraftId && (
        <div className="bg-white rounded-xl shadow-sm overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-100 text-sm">
            <thead className="bg-gray-50 text-xs uppercase text-gray-500">
              <tr>
                <th className="table-header">Tarea</th>
                <th className="table-header">Ref. regulatoria</th>
                <th className="table-header">Último cumplimiento</th>
                <th className="table-header text-right">Horas aeronave</th>
                <th className="table-header text-right">Próx. vto. (h)</th>
                <th className="table-header text-right">Próx. vto. (ciclos)</th>
                <th className="table-header">Próx. vto. (fecha)</th>
                <th className="table-header">Inspector RII</th>
                <th className="table-header">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {isLoading && (
                <tr><td colSpan={9} className="table-cell text-center text-gray-400 py-8">Cargando…</td></tr>
              )}
              {!isLoading && records.length === 0 && (
                <tr><td colSpan={9} className="table-cell text-center text-gray-400 py-8">No hay registros de cumplimiento para esta aeronave</td></tr>
              )}
              {records.map((c) => {
                const { label, cls } = dueBadge(c);
                const isOverdue = cls === 'badge-overdue';
                return (
                  <tr key={c.id} className={`transition-colors ${isOverdue ? 'bg-red-50 hover:bg-red-100' : 'hover:bg-gray-50'}`}>
                    <td className={`table-cell font-medium ${isOverdue ? 'text-red-700' : ''}`}>{c.task?.code ?? '—'}</td>
                    <td className="table-cell text-xs text-gray-500">{c.task?.referenceType} {c.task?.referenceNumber}</td>
                    <td className="table-cell text-xs">{new Date(c.performedAt).toLocaleDateString('es-MX')}</td>
                    <td className="table-cell text-right tabular-nums">{Number(c.aircraftHoursAtCompliance).toFixed(1)}</td>
                    <td className={`table-cell text-right tabular-nums ${isOverdue ? 'text-red-600 font-semibold' : ''}`}>
                      {c.nextDueHours != null ? c.nextDueHours.toFixed(1) : '—'}
                    </td>
                    <td className={`table-cell text-right tabular-nums ${isOverdue ? 'text-red-600 font-semibold' : ''}`}>
                      {c.nextDueCycles != null ? c.nextDueCycles : '—'}
                    </td>
                    <td className={`table-cell text-xs ${isOverdue ? 'text-red-600 font-semibold' : ''}`}>
                      {c.nextDueDate ? new Date(c.nextDueDate).toLocaleDateString('es-MX') : '—'}
                    </td>
                    <td className="table-cell text-xs text-gray-500">{c.inspectedBy?.name ?? '—'}</td>
                    <td className="table-cell">
                      <span className={cls}>{label}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

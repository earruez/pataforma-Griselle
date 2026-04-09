import { useQuery } from '@tanstack/react-query';
import { aircraftApi } from '@api/aircraft.api';

const STATUS_BADGE: Record<string, string> = {
  OPERATIONAL: 'badge-operational',
  AOG: 'badge-aog',
  IN_MAINTENANCE: 'badge-maintenance',
  GROUNDED: 'badge-grounded',
  DECOMMISSIONED: 'badge-decommissioned',
};

export default function AircraftPage() {
  const { data: aircraft = [], isLoading } = useQuery({ queryKey: ['aircraft'], queryFn: aircraftApi.findAll });

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Aeronaves</h2>
          <p className="text-sm text-gray-500 mt-1">{aircraft.length} aeronave{aircraft.length !== 1 ? 's' : ''} en la flota</p>
        </div>
        <button className="btn-primary">+ Nueva aeronave</button>
      </div>

      <div className="bg-white rounded-xl shadow-sm overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-100 text-sm">
          <thead className="bg-gray-50 text-xs uppercase text-gray-500">
            <tr>
              <th className="table-header">MAT</th>
              <th className="table-header">Fabricante</th>
              <th className="table-header">Modelo</th>
              <th className="table-header">N/S</th>
              <th className="table-header text-right">Horas totales</th>
              <th className="table-header text-right">Ciclos</th>
              <th className="table-header">Vto. CdN</th>
              <th className="table-header">Estado</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {isLoading && (
              <tr>
                <td colSpan={8} className="table-cell text-center text-gray-400 py-8">Cargando…</td>
              </tr>
            )}
            {!isLoading && aircraft.length === 0 && (
              <tr>
                <td colSpan={8} className="table-cell text-center text-gray-400 py-8">No hay aeronaves registradas</td>
              </tr>
            )}
            {aircraft.map((a) => (
              <tr key={a.id} className="hover:bg-gray-50 transition-colors">
                <td className="table-cell font-mono font-semibold">{a.registration}</td>
                <td className="table-cell">{a.manufacturer}</td>
                <td className="table-cell">{a.model}</td>
                <td className="table-cell font-mono text-xs">{a.serialNumber}</td>
                <td className="table-cell text-right tabular-nums">{Number(a.totalFlightHours).toFixed(1)}</td>
                <td className="table-cell text-right tabular-nums">{a.totalCycles}</td>
                <td className="table-cell text-xs">
                  {a.coaExpiryDate ? new Date(a.coaExpiryDate).toLocaleDateString('es-MX') : '—'}
                </td>
                <td className="table-cell">
                  <span className={STATUS_BADGE[a.status] ?? 'badge-grounded'}>{a.status}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

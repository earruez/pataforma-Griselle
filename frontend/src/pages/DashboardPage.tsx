import { useQuery } from '@tanstack/react-query';
import { aircraftApi } from '@api/aircraft.api';
import { complianceApi } from '@api/compliance.api';
import { Plane, AlertTriangle, ClipboardCheck, Clock } from 'lucide-react';

function StatCard({ label, value, icon: Icon, color }: { label: string; value: number | string; icon: React.ElementType; color: string }) {
  return (
    <div className="bg-white rounded-xl shadow-sm p-6 flex items-center gap-4">
      <div className={`p-3 rounded-lg ${color}`}>
        <Icon size={24} className="text-white" />
      </div>
      <div>
        <p className="text-sm text-gray-500">{label}</p>
        <p className="text-2xl font-bold text-gray-900">{value}</p>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const { data: aircraft = [] } = useQuery({ queryKey: ['aircraft'], queryFn: aircraftApi.findAll });

  const total = aircraft.length;
  const aog = aircraft.filter((a) => a.status === 'AOG').length;
  const inMaintenance = aircraft.filter((a) => a.status === 'IN_MAINTENANCE').length;
  const operational = aircraft.filter((a) => a.status === 'OPERATIONAL').length;

  return (
    <div className="p-8 space-y-8">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Dashboard</h2>
        <p className="text-sm text-gray-500 mt-1">Visión general de la flota</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-6">
        <StatCard label="Total aeronaves" value={total} icon={Plane} color="bg-brand-600" />
        <StatCard label="AOG" value={aog} icon={AlertTriangle} color="bg-red-600" />
        <StatCard label="En mantenimiento" value={inMaintenance} icon={ClipboardCheck} color="bg-yellow-500" />
        <StatCard label="Operacionales" value={operational} icon={Clock} color="bg-green-600" />
      </div>

      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <h3 className="text-base font-semibold text-gray-900">Estado de la flota</h3>
        </div>
        <table className="min-w-full divide-y divide-gray-100 text-sm">
          <thead className="bg-gray-50 text-xs uppercase text-gray-500">
            <tr>
              <th className="table-header">Matrícula</th>
              <th className="table-header">Modelo</th>
              <th className="table-header">Horas totales</th>
              <th className="table-header">Ciclos</th>
              <th className="table-header">Estado</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {aircraft.length === 0 && (
              <tr>
                <td colSpan={5} className="table-cell text-center text-gray-400 py-8">No hay aeronaves registradas</td>
              </tr>
            )}
            {aircraft.map((a) => (
              <tr key={a.id} className="hover:bg-gray-50 transition-colors">
                <td className="table-cell font-mono font-semibold">{a.registration}</td>
                <td className="table-cell">{a.model}</td>
                <td className="table-cell text-right">{Number(a.totalFlightHours).toFixed(1)}</td>
                <td className="table-cell text-right">{a.totalCycles}</td>
                <td className="table-cell">
                  <span className={`badge-${a.status.toLowerCase().replace('_', '-')}`}>{a.status}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { componentApi } from '@api/component.api';
import { aircraftApi } from '@api/aircraft.api';

function remaining(tbo: number | null, used: number | null): string {
  if (tbo == null || used == null) return '—';
  const rem = tbo - used;
  if (rem <= 0) return <span className="text-red-600 font-semibold">VENCIDO</span> as unknown as string;
  return rem.toFixed(1);
}

function RemainingCell({ tbo, used }: { tbo: number | null; used: number | null }) {
  if (tbo == null || used == null) return <td className="table-cell text-gray-400">—</td>;
  const rem = tbo - used;
  if (rem <= 0) return <td className="table-cell font-semibold text-red-600">VENCIDO</td>;
  const pct = used / tbo;
  const color = pct >= 0.9 ? 'text-red-600' : pct >= 0.75 ? 'text-yellow-600' : 'text-green-700';
  return <td className={`table-cell tabular-nums font-medium ${color}`}>{rem.toFixed(1)}</td>;
}

export default function ComponentsPage() {
  const [params, setParams] = useSearchParams();
  const selectedAircraft = params.get('aircraft') ?? '';

  const { data: aircraft = [] } = useQuery({ queryKey: ['aircraft'], queryFn: aircraftApi.findAll });
  const { data: components = [], isLoading } = useQuery({
    queryKey: ['components', selectedAircraft],
    queryFn: () => selectedAircraft ? componentApi.findByAircraft(selectedAircraft) : componentApi.findAll(),
  });

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Componentes (EQ)</h2>
          <p className="text-sm text-gray-500 mt-1">Trazabilidad de componentes y límites TBO</p>
        </div>
        <button className="btn-primary">+ Nuevo componente</button>
      </div>

      <div className="flex items-center gap-4">
        <label className="text-sm font-medium text-gray-700">Aeronave:</label>
        <select
          value={selectedAircraft}
          onChange={(e) => setParams(e.target.value ? { aircraft: e.target.value } : {})}
          className="input-base w-auto min-w-48"
        >
          <option value="">Todas</option>
          {aircraft.map((a) => (
            <option key={a.id} value={a.id}>{a.registration} — {a.model}</option>
          ))}
        </select>
      </div>

      <div className="bg-white rounded-xl shadow-sm overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-100 text-sm">
          <thead className="bg-gray-50 text-xs uppercase text-gray-500">
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
          <tbody className="divide-y divide-gray-100">
            {isLoading && (
              <tr><td colSpan={9} className="table-cell text-center text-gray-400 py-8">Cargando…</td></tr>
            )}
            {!isLoading && components.length === 0 && (
              <tr><td colSpan={9} className="table-cell text-center text-gray-400 py-8">No hay componentes registrados</td></tr>
            )}
            {components.map((c) => (
              <tr key={c.id} className="hover:bg-gray-50 transition-colors">
                <td className="table-cell font-mono text-xs">{c.partNumber}</td>
                <td className="table-cell font-mono text-xs">{c.serialNumber}</td>
                <td className="table-cell">{c.description}</td>
                <td className="table-cell text-gray-500">{c.position ?? '—'}</td>
                <td className="table-cell text-right tabular-nums">{c.totalHoursSinceNew != null ? Number(c.totalHoursSinceNew).toFixed(1) : '—'}</td>
                <td className="table-cell text-right tabular-nums">{c.hoursSinceOverhaul != null ? Number(c.hoursSinceOverhaul).toFixed(1) : '—'}</td>
                <td className="table-cell text-right tabular-nums">{c.tboHours != null ? c.tboHours : '—'}</td>
                <RemainingCell tbo={c.tboHours} used={c.hoursSinceOverhaul ?? c.totalHoursSinceNew} />
                <td className="table-cell text-xs">
                  {c.installationDate ? new Date(c.installationDate).toLocaleDateString('es-MX') : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

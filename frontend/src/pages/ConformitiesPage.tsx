import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { FileCheck2 } from 'lucide-react';
import { workOrdersApi } from '@api/workOrders.api';

export default function ConformitiesPage() {
  const { data: workOrders = [], isLoading } = useQuery({
    queryKey: ['work-orders'],
    queryFn: () => workOrdersApi.list(),
  });

  const conformities = useMemo(
    () => workOrders.flatMap((wo) => wo.discrepancies.map((d) => ({ ...d, workOrderNumber: wo.number, workOrderId: wo.id }))),
    [workOrders],
  );

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 bg-brand-50 rounded-lg flex items-center justify-center">
          <FileCheck2 size={18} className="text-brand-600" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-slate-900">Conformidades</h1>
          <p className="text-sm text-slate-500">Seguimiento de hallazgos y conformidades en Órdenes de Trabajo</p>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-100 text-sm font-semibold text-slate-700">
          Total: {conformities.length}
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="text-left px-4 py-2.5">Código</th>
                <th className="text-left px-4 py-2.5">OT</th>
                <th className="text-left px-4 py-2.5">Título</th>
                <th className="text-left px-4 py-2.5">Estado</th>
                <th className="text-left px-4 py-2.5">Fecha</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr><td className="px-4 py-4 text-slate-400" colSpan={5}>Cargando…</td></tr>
              )}
              {!isLoading && conformities.length === 0 && (
                <tr><td className="px-4 py-4 text-slate-400" colSpan={5}>No hay conformidades registradas.</td></tr>
              )}
              {conformities.map((c) => (
                <tr key={c.id} className="border-t border-slate-100">
                  <td className="px-4 py-2.5 font-mono text-xs">{c.code}</td>
                  <td className="px-4 py-2.5">
                    <Link className="text-brand-600 hover:underline" to={`/work-orders/${c.workOrderId}`}>
                      {c.workOrderNumber}
                    </Link>
                  </td>
                  <td className="px-4 py-2.5">{c.title}</td>
                  <td className="px-4 py-2.5">
                    <span className="inline-flex rounded-full px-2 py-0.5 text-xs font-semibold bg-slate-100 text-slate-700">
                      {c.status}
                    </span>
                  </td>
                  <td className="px-4 py-2.5">{new Date(c.createdAt).toLocaleDateString('es-MX')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

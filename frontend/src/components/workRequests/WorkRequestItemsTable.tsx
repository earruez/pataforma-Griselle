import { WorkRequestItem, WORK_REQUEST_ITEM_STATUS_LABELS } from '../../shared/workRequestTypes';

export function WorkRequestItemsTable({ items }: { items: WorkRequestItem[] }) {
  return (
    <table className="min-w-full text-xs border mb-2">
      <thead>
        <tr className="bg-slate-100">
          <th className="px-2 py-1">ATA</th>
          <th className="px-2 py-1">Referencia</th>
          <th className="px-2 py-1">Título</th>
          <th className="px-2 py-1">Descripción</th>
          <th className="px-2 py-1">Prioridad</th>
          <th className="px-2 py-1">Estado</th>
        </tr>
      </thead>
      <tbody>
        {items.map((item) => (
          <tr key={item.id}>
            <td className="px-2 py-1 font-mono">{item.ataCode}</td>
            <td className="px-2 py-1">{item.referenceCode}</td>
            <td className="px-2 py-1">{item.title}</td>
            <td className="px-2 py-1">{item.description}</td>
            <td className="px-2 py-1 text-center capitalize">{item.priority}</td>
            <td className="px-2 py-1 text-center">{WORK_REQUEST_ITEM_STATUS_LABELS[item.itemStatus]}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

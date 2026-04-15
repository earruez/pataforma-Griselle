import { getVisibleSTStatusLabel, WorkRequestStatusHistory } from '../../shared/workRequestTypes';

export function WorkRequestHistory({ history }: { history: WorkRequestStatusHistory[] }) {
  if (!history.length) return <div className="text-slate-400">Aun no hay movimientos.</div>;
  return (
    <ul className="list-disc pl-5 text-sm text-slate-700">
      {history.map((h) => (
        <li key={h.id}>
          Paso de <b>{getVisibleSTStatusLabel(h.fromStatus)}</b> a <b>{getVisibleSTStatusLabel(h.toStatus)}</b>
          {' '}
          el {h.changedAt.slice(0, 10)}
          {h.comment && <span className="text-xs text-slate-500"> ({h.comment})</span>}
        </li>
      ))}
    </ul>
  );
}

import { WorkRequestAttachment } from '../../shared/workRequestTypes';

export function WorkRequestAttachments({ attachments }: { attachments: WorkRequestAttachment[] }) {
  if (!attachments.length) {
    return (
      <div className="rounded-lg border border-dashed border-slate-300 bg-white px-3 py-4 text-center">
        <p className="text-xs font-semibold text-slate-600">Sin adjuntos</p>
        <p className="text-[11px] text-slate-400 mt-0.5">Aun no se ha cargado evidencia para esta ST.</p>
      </div>
    );
  }

  return (
    <ul className="space-y-2">
      {attachments.map((att) => (
        <li key={att.id} className="rounded-lg border border-slate-200 bg-white px-3 py-2">
          <a href={att.fileUrl} target="_blank" rel="noopener noreferrer" className="text-sm font-medium text-brand-700 hover:text-brand-800 hover:underline break-all">
            {att.fileName}
          </a>
          <span className="text-[11px] text-slate-400 ml-1.5">({att.fileType})</span>
        </li>
      ))}
    </ul>
  );
}

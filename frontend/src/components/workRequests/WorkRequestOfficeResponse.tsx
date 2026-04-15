import { WorkRequest } from '../../shared/workRequestTypes';

export function WorkRequestOfficeResponse({ workRequest }: { workRequest: WorkRequest }) {
  if (!workRequest.otReference && !workRequest.returnedSignedOtUrl) {
    return <div className="text-slate-400">Sin respuesta de Oficina Técnica aún.</div>;
  }
  return (
    <div>
      {workRequest.otReference && (
        <div>
          <b>OT vinculada:</b> {workRequest.otReference}
        </div>
      )}
      {workRequest.returnedSignedOtUrl && (
        <div>
          <a href={workRequest.returnedSignedOtUrl} target="_blank" rel="noopener noreferrer" className="text-blue-700 underline">
            Descargar OT firmada
          </a>
        </div>
      )}
    </div>
  );
}

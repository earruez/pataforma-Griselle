import { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ClipboardList } from 'lucide-react';
import toast from 'react-hot-toast';
import { WorkRequestSummary } from '../components/workRequests/WorkRequestSummary';
import { WorkRequestFilters } from '../components/workRequests/WorkRequestFilters';
import { WorkRequestTable } from '../components/workRequests/WorkRequestTable';
import WorkRequestDetailPage from './WorkRequestDetailPage';
import { useWorkRequestStore } from '../store/workRequestStore';

export default function WorkRequestsPage() {
  const [searchParams] = useSearchParams();
  const selectedId = useWorkRequestStore(s => s.selectedWorkRequestId);
  const viewDensity = useWorkRequestStore(s => s.viewDensity);
  const setViewDensity = useWorkRequestStore(s => s.setViewDensity);
  const setFilterAircraftId = useWorkRequestStore(s => s.setFilterAircraftId);
  const setSearchText = useWorkRequestStore(s => s.setSearchText);
  const selectWorkRequest = useWorkRequestStore(s => s.selectWorkRequest);
  const filterAircraftId = useWorkRequestStore(s => s.filterAircraftId);
  const createWorkRequest = useWorkRequestStore(s => s.createWorkRequest);
  const getDraftWorkRequestByAircraft = useWorkRequestStore(s => s.getDraftWorkRequestByAircraft);

  useEffect(() => {
    const aircraftId = searchParams.get('aircraftId');
    const stId = searchParams.get('stId');
    const search = searchParams.get('search');

    if (aircraftId) setFilterAircraftId(aircraftId);
    if (search) setSearchText(search);
    if (stId) selectWorkRequest(stId, 'general');
  }, [searchParams, setFilterAircraftId, setSearchText, selectWorkRequest]);

  return selectedId ? (
    <WorkRequestDetailPage />
  ) : (
    <div className="p-6 lg:p-8 space-y-6 max-w-7xl mx-auto">
      <div className="bg-white border border-slate-200 rounded-2xl p-5 lg:p-6 shadow-sm">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-brand-50 flex items-center justify-center shrink-0">
            <ClipboardList size={18} className="text-brand-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Solicitudes de Trabajo</h1>
            <p className="text-sm text-slate-600 mt-1">Revisa, crea y envia ST en una sola vista, con foco en lo operativo.</p>
          </div>
        </div>
      </div>

      <WorkRequestSummary />
      <div className="bg-white rounded-2xl border border-slate-200 p-4 lg:p-5 shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Vista</p>
          <div className="flex items-center gap-2">
            <button
              className="btn-primary btn-xs"
              onClick={() => {
                if (!filterAircraftId) {
                  toast.error('Selecciona una aeronave en filtros para crear una ST');
                  return;
                }
                const wr = createWorkRequest(filterAircraftId);
                selectWorkRequest(wr.id, 'general');
              }}
            >
              + Nueva ST
            </button>
            <button
              className="btn-secondary btn-xs"
              onClick={() => {
                if (!filterAircraftId) {
                  toast.error('Selecciona una aeronave para abrir su borrador');
                  return;
                }
                const draft = getDraftWorkRequestByAircraft(filterAircraftId);
                if (!draft) {
                  toast('No existe borrador activo para esta aeronave', { icon: 'ℹ️' });
                  return;
                }
                selectWorkRequest(draft.id, 'general');
              }}
            >
              Abrir borrador
            </button>
            <div className="inline-flex bg-slate-100 rounded-lg p-1 border border-slate-200">
              <button
                className={`px-2.5 py-1 text-xs rounded-md transition-colors ${viewDensity === 'comfortable' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                onClick={() => setViewDensity('comfortable')}
              >
                Comoda
              </button>
              <button
                className={`px-2.5 py-1 text-xs rounded-md transition-colors ${viewDensity === 'compact' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                onClick={() => setViewDensity('compact')}
              >
                Compacta
              </button>
            </div>
          </div>
        </div>
        <WorkRequestFilters />
        <WorkRequestTable />
      </div>
    </div>
  );
}

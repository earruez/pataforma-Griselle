import {
  getVisibleSTStatus,
  ST_VISIBLE_BADGE_CONFIG,
  WorkRequestStatus,
} from '../../shared/workRequestTypes';

export function WorkRequestBadge({ status }: { status: WorkRequestStatus }) {
  const visibleStatus = getVisibleSTStatus(status);
  const config = ST_VISIBLE_BADGE_CONFIG[visibleStatus];

  return (
    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-semibold ring-1 ring-inset ring-slate-200 ${config.className}`}>
      {config.label}
    </span>
  );
}

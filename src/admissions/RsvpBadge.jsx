import { portalConfig, rsvpBadgeKey } from './portalConfig';

export default function RsvpBadge({ application }) {
  const meta = portalConfig.rsvpStatuses[rsvpBadgeKey(application)];
  return (
    <span
      className={`inline-flex items-center rounded-full border px-3 py-1 font-mono text-[10px] font-bold uppercase tracking-widest ${meta.tone}`}
    >
      {meta.label}
    </span>
  );
}

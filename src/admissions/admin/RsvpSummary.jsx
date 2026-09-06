import { summarizeRsvps } from './rsvpSummary';

const CELLS = [
  ['Admitted', 'admitted', 'text-white'],
  ['Attending', 'attending', 'text-emerald-300'],
  ['Declined', 'declined', 'text-rose-300'],
  ['Pending', 'pending', 'text-secondary-fixed'],
  ['Checked in', 'checkedIn', 'text-primary'],
];

export default function RsvpSummary({ applications }) {
  const counts = summarizeRsvps(applications);
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
      {CELLS.map(([label, key, tone]) => (
        <div
          className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3"
          key={key}
        >
          <div className="font-mono text-[10px] font-bold uppercase tracking-widest text-outline">
            {label}
          </div>
          <div className={`mt-1 font-display text-2xl font-black ${tone}`}>
            {counts[key]}
          </div>
        </div>
      ))}
    </div>
  );
}

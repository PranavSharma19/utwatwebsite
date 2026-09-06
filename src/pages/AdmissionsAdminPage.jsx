import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  Download,
  ExternalLink,
  Loader2,
  QrCode,
  RefreshCw,
  Search,
  ShieldAlert,
} from "lucide-react";
import AuthPanel from "../admissions/AuthPanel";
import PortalShell from "../admissions/PortalShell";
import StatusBadge from "../admissions/StatusBadge";
import RsvpBadge from "../admissions/RsvpBadge";
// The .jsx here is load-bearing: `admissions/admin/` also has a rsvpSummary.js
// (Task 9's summarizeRsvps, no default export). On a case-insensitive
// filesystem an extensionless import of "RsvpSummary" resolves to that file
// instead of this component and `vite build` fails with a missing default
// export -- `npm test` does not catch it. Do not "clean up" this extension.
import RsvpSummary from "../admissions/admin/RsvpSummary.jsx";
import {
  createAdminResumeUrl,
  listAdminApplications,
  updateAdminApplication,
} from "../admissions/applicationService";
import {
  buildAdmittedCsv,
  buildApplicationsCsv,
  buildAttendingCsv,
  downloadCsv,
} from "../admissions/admin/exports";
import { portalConfig, rsvpBadgeKey } from "../admissions/portalConfig";
import { supabase } from "../admissions/supabaseClient";
import { useSupabaseSession } from "../admissions/useSupabaseSession";

const statusOptions = Object.keys(portalConfig.statuses);
const rsvpOptions = Object.keys(portalConfig.rsvpStatuses);

function formatDate(value) {
  if (!value) {
    return "-";
  }

  return new Intl.DateTimeFormat("en-CA", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "America/Toronto",
  }).format(new Date(value));
}

// Only allow http(s) links to render as clickable anchors. Applicant-controlled
// link values reach here; a `javascript:`/`data:` href would execute in the
// admin origin (stored XSS -> session takeover). Anything else renders inert.
function safeHref(value) {
  if (typeof value !== "string") {
    return null;
  }

  try {
    const url = new URL(value);
    if (url.protocol === "http:" || url.protocol === "https:") {
      return url.href;
    }
  } catch {
    // Not a parseable absolute URL.
  }

  return null;
}

function DetailText({ label, children }) {
  return (
    <div>
      <div className="font-mono text-[10px] font-bold uppercase tracking-widest text-outline">
        {label}
      </div>
      <div className="mt-1 text-sm leading-relaxed text-on-surface-variant">
        {children || "-"}
      </div>
    </div>
  );
}

function ApplicationDetail({
  application,
  updating,
  onClose,
  onUpdate,
  onOpenResume,
}) {
  const [status, setStatus] = useState(application.status);
  const [adminNotes, setAdminNotes] = useState(application.admin_notes || "");
  const [confirmReset, setConfirmReset] = useState(false);

  return (
    <aside className="glass-panel rounded-3xl border border-primary/10 bg-surface-container-lowest/90 p-6 backdrop-blur-2xl lg:sticky lg:top-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="font-mono text-[10px] font-bold uppercase tracking-widest text-outline">
            Applicant
          </div>
          <h2 className="mt-2 font-display text-2xl font-black uppercase text-white">
            {application.first_name || "Unnamed"} {application.last_name || ""}
          </h2>
          <p className="mt-1 text-sm text-on-surface-variant">
            {application.email}
          </p>
        </div>
        <button
          className="rounded-full border border-white/10 px-3 py-1 font-mono text-[10px] uppercase tracking-widest text-outline hover:text-white"
          onClick={onClose}
          type="button"
        >
          Close
        </button>
      </div>

      <div className="mt-6 grid gap-4">
        <DetailText label="School">{application.school}</DetailText>
        <DetailText label="Program">{application.program}</DetailText>
        <DetailText label="Track">{application.preferred_track}</DetailText>
        <DetailText label="Submitted">
          {formatDate(application.submitted_at)}
        </DetailText>
      </div>

      <div className="mt-6 grid gap-4">
        <DetailText label="Links">
          {Object.entries(application.links || {})
            .filter(([, value]) => value)
            .map(([key, value]) => {
              const href = safeHref(value);
              const label = key.replace("_url", "");

              if (!href) {
                return (
                  <span
                    className="mr-3 inline-flex items-center gap-1 text-outline line-through"
                    key={key}
                    title={`Blocked non-http link: ${value}`}
                  >
                    {label}
                  </span>
                );
              }

              return (
                <a
                  className="mr-3 inline-flex items-center gap-1 text-primary hover:text-primary-fixed-dim"
                  href={href}
                  key={key}
                  rel="noreferrer"
                  target="_blank"
                >
                  {label}
                  <ExternalLink size={12} />
                </a>
              );
            })}
        </DetailText>

        {application.resume_path && (
          <button
            className="inline-flex items-center justify-center gap-2 rounded-full border border-primary/30 bg-primary/5 px-4 py-2 font-mono text-[10px] font-bold uppercase tracking-widest text-primary hover:bg-primary/10"
            onClick={() => onOpenResume(application.resume_path)}
            type="button"
          >
            <ExternalLink size={14} />
            Open Resume
          </button>
        )}
      </div>

      {application.status === "admitted" && (
        <div className="mt-6 space-y-4 border-t border-white/10 pt-6">
          <div className="flex items-center justify-between">
            <div className="font-mono text-[10px] font-bold uppercase tracking-widest text-outline">
              RSVP
            </div>
            <RsvpBadge application={application} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <DetailText label="Responded">{formatDate(application.rsvp_at)}</DetailText>
            <DetailText label="Waiver">
              {application.waiver_accepted_at
                ? `${application.waiver_version} · ${formatDate(application.waiver_accepted_at)}`
                : null}
            </DetailText>
            <DetailText label="Emergency contact">
              {application.emergency_contact_name
                ? `${application.emergency_contact_name} · ${application.emergency_contact_phone}`
                : null}
            </DetailText>
            <DetailText label="Dietary">{application.dietary_restrictions}</DetailText>
            <DetailText label="Public roster">
              {application.rsvp_status === "attending"
                ? application.roster_opt_in ? "Opted in" : "Opted out"
                : null}
            </DetailText>
            <DetailText label="Checked in">
              {application.checked_in_at
                ? `${formatDate(application.checked_in_at)} by ${application.checked_in_by}`
                : null}
            </DetailText>
          </div>

          <div className="flex flex-wrap gap-2">
            {application.rsvp_status === "attending" && !application.checked_in_at && (
              <button
                className="rounded-full border border-primary/30 bg-primary/5 px-4 py-2 font-mono text-[10px] font-bold uppercase tracking-widest text-primary hover:bg-primary/10 disabled:opacity-60"
                disabled={updating}
                onClick={() => onUpdate(application.id, { checked_in: true })}
                type="button"
              >
                Check in manually
              </button>
            )}
            {application.checked_in_at && (
              <button
                className="rounded-full border border-white/10 bg-white/5 px-4 py-2 font-mono text-[10px] font-bold uppercase tracking-widest text-on-surface-variant hover:text-white disabled:opacity-60"
                disabled={updating}
                onClick={() => onUpdate(application.id, { checked_in: false })}
                type="button"
              >
                Undo check-in
              </button>
            )}
            {application.rsvp_status !== "pending" && !confirmReset && (
              <button
                className="rounded-full border border-rose-400/30 bg-rose-400/5 px-4 py-2 font-mono text-[10px] font-bold uppercase tracking-widest text-rose-300 hover:bg-rose-400/10"
                onClick={() => setConfirmReset(true)}
                type="button"
              >
                Reset RSVP
              </button>
            )}
            {confirmReset && (
              <>
                <button
                  className="rounded-full bg-rose-500/80 px-4 py-2 font-mono text-[10px] font-bold uppercase tracking-widest text-white disabled:opacity-60"
                  disabled={updating}
                  onClick={() => {
                    setConfirmReset(false);
                    onUpdate(application.id, { rsvp_reset: true });
                  }}
                  type="button"
                >
                  Confirm reset — they will need to RSVP again
                </button>
                <button
                  className="rounded-full border border-white/10 px-4 py-2 font-mono text-[10px] uppercase tracking-widest text-outline"
                  onClick={() => setConfirmReset(false)}
                  type="button"
                >
                  Cancel
                </button>
              </>
            )}
          </div>
        </div>
      )}

      <div className="mt-6 space-y-5 border-t border-white/10 pt-6">
        {[
          ["Why BOTS", application.responses?.why_bots],
          ["Project", application.responses?.project_story],
          ["Future Build", application.responses?.future_build],
          ["Anything Else", application.responses?.anything_else],
          ["Joke", application.responses?.joke],
        ].map(([label, value]) => (
          <DetailText key={label} label={label}>
            {value}
          </DetailText>
        ))}
      </div>

      <div className="mt-6 space-y-4 border-t border-white/10 pt-6">
        <label className="block">
          <span className="mb-2 block font-mono text-[10px] font-bold uppercase tracking-widest text-outline">
            Decision Status
          </span>
          <select
            className="w-full rounded-xl border border-primary/10 bg-surface-container-lowest/90 px-4 py-3 text-sm text-white outline-none focus:border-primary/50"
            onChange={(event) => setStatus(event.target.value)}
            value={status}
          >
            {statusOptions.map((option) => (
              <option key={option} value={option}>
                {portalConfig.statuses[option].label}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="mb-2 block font-mono text-[10px] font-bold uppercase tracking-widest text-outline">
            Admin Notes
          </span>
          <textarea
            className="w-full rounded-xl border border-primary/10 bg-surface-container-lowest/90 px-4 py-3 text-sm leading-relaxed text-white outline-none focus:border-primary/50"
            onChange={(event) => setAdminNotes(event.target.value)}
            rows={5}
            value={adminNotes}
          />
        </label>

        <button
          className="w-full rounded-full bg-gradient-to-r from-cyber-blue to-primary-container px-6 py-3 font-mono text-[10px] font-bold uppercase tracking-widest text-white shadow-glow-blue disabled:cursor-not-allowed disabled:opacity-60"
          disabled={updating}
          onClick={() =>
            onUpdate(application.id, { status, admin_notes: adminNotes })
          }
          type="button"
        >
          {updating ? "Saving..." : "Save Decision"}
        </button>
      </div>
    </aside>
  );
}

export default function AdmissionsAdminPage() {
  const { configured, loading, user } = useSupabaseSession();
  const [applications, setApplications] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [statusFilter, setStatusFilter] = useState("all");
  const [schoolFilter, setSchoolFilter] = useState("all");
  const [rsvpFilter, setRsvpFilter] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [pageError, setPageError] = useState("");
  const [pageMessage, setPageMessage] = useState("");
  const [loadingApplications, setLoadingApplications] = useState(false);
  const [updating, setUpdating] = useState(false);

  const selectedApplication = applications.find(
    (application) => application.id === selectedId,
  );

  const filteredApplications = useMemo(() => {
    const search = searchTerm.trim().toLowerCase();
    return applications.filter((application) => {
      const matchesStatus =
        statusFilter === "all" || application.status === statusFilter;
      const matchesSchool =
        schoolFilter === "all" || application.school === schoolFilter;
      // rsvpBadgeKey defaults to 'pending' for any application, admitted or
      // not, since non-admitted rows have no rsvp_status. Gate on
      // status === "admitted" too so "RSVP Pending" here matches
      // summarizeRsvps' admitted-only headcount above the table.
      const matchesRsvp =
        rsvpFilter === "all" ||
        (application.status === "admitted" &&
          rsvpBadgeKey(application) === rsvpFilter);
      const matchesSearch =
        !search ||
        [
          application.email,
          application.first_name,
          application.last_name,
          application.school,
          application.program,
          application.preferred_track,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(search);

      return matchesStatus && matchesSchool && matchesRsvp && matchesSearch;
    });
  }, [applications, rsvpFilter, schoolFilter, searchTerm, statusFilter]);

  const loadApplications = async () => {
    setLoadingApplications(true);
    setPageError("");
    setPageMessage("");
    try {
      const records = await listAdminApplications();
      setApplications(records);
      if (!selectedId && records[0]) {
        setSelectedId(records[0].id);
      }
    } catch (error) {
      setPageError(error.message || "Unable to load applications.");
    } finally {
      setLoadingApplications(false);
    }
  };

  useEffect(() => {
    if (user) {
      queueMicrotask(() => {
        loadApplications();
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const handleSignOut = async () => {
    await supabase?.auth.signOut();
  };

  const handleUpdate = async (applicationId, updates) => {
    setUpdating(true);
    setPageError("");
    setPageMessage("");
    try {
      const updated = await updateAdminApplication(applicationId, updates);
      setApplications((current) =>
        current.map((application) =>
          application.id === updated.id ? updated : application,
        ),
      );
      setPageMessage("Application updated.");
    } catch (error) {
      setPageError(error.message || "Unable to update application.");
    } finally {
      setUpdating(false);
    }
  };

  const handleOpenResume = async (path) => {
    setPageError("");
    try {
      const url = await createAdminResumeUrl(path);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (error) {
      setPageError(error.message || "Unable to create resume link.");
    }
  };

  return (
    <PortalShell
      admin
      eyebrow="Organizer Console"
      onSignOut={handleSignOut}
      subtitle="Review submitted applications, update admissions statuses, export rows, and inspect applicant details."
      title="Admissions Admin"
      user={user}
    >
      {!configured && (
        <div className="rounded-3xl border border-secondary-fixed/20 bg-secondary-fixed/5 p-8 text-on-surface-variant">
          Configure Supabase env vars before using the admin console.
        </div>
      )}

      {configured && loading && (
        <div className="flex items-center gap-3 text-on-surface-variant">
          <Loader2 className="animate-spin text-primary" size={18} />
          Checking session...
        </div>
      )}

      {configured && !loading && !user && (
        <AuthPanel redirectPath={portalConfig.adminPath} />
      )}

      {configured && user && (
        <div className="space-y-6">
          <div className="glass-panel rounded-3xl border border-primary/10 bg-surface-container-lowest/80 p-5 backdrop-blur-2xl">
            <div className="grid gap-4 lg:grid-cols-[1fr_repeat(3,minmax(0,auto))] xl:flex xl:flex-wrap">
              <label className="relative block">
                <Search
                  className="absolute left-4 top-1/2 -translate-y-1/2 text-primary/60"
                  size={16}
                />
                <input
                  className="w-full rounded-xl border border-primary/10 bg-surface-container-lowest/90 py-3 pl-11 pr-4 text-sm text-white outline-none placeholder:text-outline focus:border-primary/50"
                  onChange={(event) => setSearchTerm(event.target.value)}
                  placeholder="Search applicants..."
                  value={searchTerm}
                />
              </label>

              <select
                className="rounded-xl border border-primary/10 bg-surface-container-lowest/90 px-4 py-3 text-sm text-white outline-none focus:border-primary/50"
                onChange={(event) => setStatusFilter(event.target.value)}
                value={statusFilter}
              >
                <option value="all">All statuses</option>
                {statusOptions.map((status) => (
                  <option key={status} value={status}>
                    {portalConfig.statuses[status].label}
                  </option>
                ))}
              </select>

              <select
                className="rounded-xl border border-primary/10 bg-surface-container-lowest/90 px-4 py-3 text-sm text-white outline-none focus:border-primary/50"
                onChange={(event) => setSchoolFilter(event.target.value)}
                value={schoolFilter}
              >
                <option value="all">All schools</option>
                {portalConfig.allowedSchools.map((school) => (
                  <option key={school} value={school}>
                    {school}
                  </option>
                ))}
              </select>

              <select
                className="rounded-xl border border-primary/10 bg-surface-container-lowest/90 px-4 py-3 text-sm text-white outline-none focus:border-primary/50"
                onChange={(event) => setRsvpFilter(event.target.value)}
                value={rsvpFilter}
              >
                <option value="all">All RSVPs</option>
                {rsvpOptions.map((key) => (
                  <option key={key} value={key}>
                    {portalConfig.rsvpStatuses[key].label}
                  </option>
                ))}
              </select>

              <button
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-primary/30 bg-primary/5 px-4 py-3 font-mono text-[10px] font-bold uppercase tracking-widest text-primary hover:bg-primary/10"
                onClick={loadApplications}
                type="button"
              >
                <RefreshCw size={14} />
                Refresh
              </button>

              <button
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-secondary-fixed/30 bg-secondary-fixed/5 px-4 py-3 font-mono text-[10px] font-bold uppercase tracking-widest text-secondary-fixed hover:bg-secondary-fixed/10"
                onClick={() =>
                  downloadCsv(
                    "bots-applications.csv",
                    buildApplicationsCsv(filteredApplications),
                  )
                }
                type="button"
              >
                <Download size={14} />
                Export CSV
              </button>

              <button
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-emerald-400/30 bg-emerald-400/5 px-4 py-3 font-mono text-[10px] font-bold uppercase tracking-widest text-emerald-300 hover:bg-emerald-400/10"
                onClick={() =>
                  downloadCsv(
                    "bots-admitted-mail-merge.csv",
                    buildAdmittedCsv(applications, window.location.origin),
                  )
                }
                type="button"
              >
                <Download size={14} />
                Export Admitted
              </button>

              <button
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-emerald-400/30 bg-emerald-400/5 px-4 py-3 font-mono text-[10px] font-bold uppercase tracking-widest text-emerald-300 hover:bg-emerald-400/10"
                onClick={() =>
                  downloadCsv("bots-attending.csv", buildAttendingCsv(applications))
                }
                type="button"
              >
                <Download size={14} />
                Export Attending
              </button>

              <Link
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-primary/30 bg-primary/5 px-4 py-3 font-mono text-[10px] font-bold uppercase tracking-widest text-primary hover:bg-primary/10"
                to={`${portalConfig.adminPath}/checkin`}
              >
                <QrCode size={14} />
                Door Scan
              </Link>
            </div>
          </div>

          <RsvpSummary applications={applications} />

          {pageError && (
            <div className="flex items-center gap-3 rounded-2xl border border-rose-400/20 bg-rose-950/20 p-5 text-sm text-rose-100">
              <ShieldAlert size={18} />
              {pageError}
            </div>
          )}

          {pageMessage && (
            <div className="rounded-2xl border border-emerald-400/20 bg-emerald-950/20 p-5 text-sm text-emerald-100">
              {pageMessage}
            </div>
          )}

          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_420px]">
            <div className="overflow-hidden rounded-3xl border border-primary/10 bg-surface-container-lowest/80">
              <div className="border-b border-white/10 px-5 py-4 font-mono text-[10px] font-bold uppercase tracking-widest text-outline">
                {loadingApplications
                  ? "Loading applications..."
                  : `${filteredApplications.length} applications`}
              </div>

              <div className="max-h-[720px] overflow-auto">
                <table className="w-full min-w-[880px] text-left text-sm">
                  <thead className="sticky top-0 bg-surface-container-lowest text-[10px] uppercase tracking-widest text-outline">
                    <tr>
                      <th className="px-5 py-3 font-mono">Applicant</th>
                      <th className="px-5 py-3 font-mono">School</th>
                      <th className="px-5 py-3 font-mono">Track</th>
                      <th className="px-5 py-3 font-mono">Status</th>
                      <th className="px-5 py-3 font-mono">RSVP</th>
                      <th className="px-5 py-3 font-mono">Submitted</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {filteredApplications.map((application) => (
                      <tr
                        className={`cursor-pointer transition-colors hover:bg-primary/5 ${
                          selectedId === application.id ? "bg-primary/10" : ""
                        }`}
                        key={application.id}
                        onClick={() => setSelectedId(application.id)}
                      >
                        <td className="px-5 py-4">
                          <div className="font-semibold text-white">
                            {application.first_name || "Unnamed"}{" "}
                            {application.last_name || ""}
                          </div>
                          <div className="text-xs text-outline">
                            {application.email}
                          </div>
                        </td>
                        <td className="px-5 py-4 text-on-surface-variant">
                          {application.school || "-"}
                        </td>
                        <td className="px-5 py-4 text-on-surface-variant">
                          {application.preferred_track || "-"}
                        </td>
                        <td className="px-5 py-4">
                          <StatusBadge status={application.status} />
                        </td>
                        <td className="px-5 py-4">
                          {application.status === "admitted" ? (
                            <RsvpBadge application={application} />
                          ) : (
                            <span className="text-outline">-</span>
                          )}
                        </td>
                        <td className="px-5 py-4 text-on-surface-variant">
                          {formatDate(application.submitted_at)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {!loadingApplications && filteredApplications.length === 0 && (
                  <div className="p-8 text-center text-sm text-on-surface-variant">
                    No applications match the current filters.
                  </div>
                )}
              </div>
            </div>

            {selectedApplication ? (
              <ApplicationDetail
                application={selectedApplication}
                key={selectedApplication.id}
                onClose={() => setSelectedId(null)}
                onOpenResume={handleOpenResume}
                onUpdate={handleUpdate}
                updating={updating}
              />
            ) : (
              <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-8 text-sm text-on-surface-variant">
                Select an application to inspect details.
              </div>
            )}
          </div>
        </div>
      )}
    </PortalShell>
  );
}

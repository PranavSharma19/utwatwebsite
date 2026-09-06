/** The headcount. Attending includes the checked-in; pending is the gap. */
export function summarizeRsvps(applications) {
  const admitted = applications.filter((a) => a.status === 'admitted');
  return {
    admitted: admitted.length,
    attending: admitted.filter((a) => a.rsvp_status === 'attending').length,
    declined: admitted.filter((a) => a.rsvp_status === 'declined').length,
    pending: admitted.filter((a) => a.rsvp_status === 'pending').length,
    checkedIn: admitted.filter((a) => a.checked_in_at).length,
  };
}

// Remove everything the stress test created. Requires the service role.
// SUPABASE_SERVICE_ROLE_KEY=... STRESS_EMAIL_BASE=you@gmail.com node scripts/stress/cleanup.mjs
import { getConfig, errorSummary, serviceClient } from './lib.mjs';

const config = getConfig();
const admin = serviceClient(config);
if (!admin) {
  console.log('SUPABASE_SERVICE_ROLE_KEY is required for cleanup.');
  process.exit(1);
}
const [local, domain] = (config.emailBase || '@').split('@');
const prefix = `${local}+bots-stress-`;

let page = 1;
let removed = 0;
for (;;) {
  const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
  if (error) throw error;
  const targets = data.users.filter(
    (u) => u.email?.startsWith(prefix) && u.email.endsWith(`@${domain}`),
  );
  for (const u of targets) {
    // Storage objects are not cascaded by auth.users deletion; remove first.
    const { data: objects } = await admin.storage.from('resumes').list(u.id);
    for (const folder of objects || []) {
      const { data: files } = await admin.storage
        .from('resumes')
        .list(`${u.id}/${folder.name}`);
      const paths = (files || []).map((f) => `${u.id}/${folder.name}/${f.name}`);
      if (paths.length) await admin.storage.from('resumes').remove(paths);
    }
    const { error: delError } = await admin.auth.admin.deleteUser(u.id);
    console.log(
      `  ${u.email}: ${delError ? 'FAILED ' + errorSummary(delError) : 'deleted (application row cascades)'}`,
    );
    if (!delError) removed += 1;
  }
  if (data.users.length < 200) break;
  page += 1;
}
console.log(`${removed} test user(s) removed.`);

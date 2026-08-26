# Applicant portal stress harness

Scripts that hit the **live** Supabase project behind `/apply` the way real
applicants (and applicants with DevTools open) would. Results land in
`scripts/stress/.out/` (git-ignored; `sessions.json` holds real JWTs).

All scripts read `.env.local` and tolerate the `/rest/v1/` suffix bug in
`VITE_SUPABASE_URL` (they warn and strip it).

| Step | Command | Needs |
|------|---------|-------|
| 1. Sign-in burst | `STRESS_EMAIL_BASE=you@gmail.com STRESS_USERS=10 node scripts/stress/signup-burst.mjs` | nothing. Fires N concurrent `signInWithOtp` calls for `you+bots-stress-N@gmail.com`. With Supabase Auth CAPTCHA on (it is), every scripted call is rejected — that is the point of the check. |
| 2. Sessions | `SUPABASE_SERVICE_ROLE_KEY=... STRESS_EMAIL_BASE=you@gmail.com node scripts/stress/sessions.mjs` | service-role key (Supabase dashboard → Project Settings → API). Creates the test users and mints sessions without sending email. Alternative without the key: `STRESS_MAGIC_LINKS=links.txt` with one *unclicked* magic-link URL per line. |
| 3. Suite | `node scripts/stress/applicant-suite.mjs` | `.out/sessions.json` with ≥ 2 sessions. Runs concurrency, garbage-input, privilege, storage and submit scenarios. `STRESS_SKIP_BIG_UPLOAD=1` skips the 10 MB upload. |
| 4. Cleanup | `SUPABASE_SERVICE_ROLE_KEY=... STRESS_EMAIL_BASE=you@gmail.com node scripts/stress/cleanup.mjs` | service-role key. Deletes every `you+bots-stress-*` user; their application rows cascade, their resumes are removed first. |

Offline companion: `npm test -- applicationValidation.stress` runs the
garbage-input matrix against the client validation and payload builders. The
`it.fails` cases there are known gaps; when you fix one, flip it to `it`.

Never run the service-role key through the browser or commit it. Keep it in
your shell environment only.

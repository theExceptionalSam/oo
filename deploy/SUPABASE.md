# Supabase setup instructions
# =========================================================================
#
# 1. Create a project at supabase.com (free tier to start, $25/mo Pro for prod).
# 2. Pick region: Frankfurt (closest to Nigeria with low latency).
# 3. Set a strong database password — save it in a password manager.
#
# Connection strings (Project Settings → Database):
#   Direct URL:    postgresql://postgres:[PASSWORD]@db.[project].supabase.co:5432/postgres
#   Pooler URL:    postgresql://postgres.[project]:[PASSWORD]@aws-0-[region].pooler.supabase.com:6543/postgres
#
# USE THE POOLER URL in production. The direct URL has a 60-connection cap;
# the pooler multiplexes thousands of connections through a small PgBouncer pool.
#
# Set these env vars in Render:
#   DB_HOST     = aws-0-[region].pooler.supabase.com
#   DB_PORT     = 6543
#   DB_USERNAME = postgres.[project]
#   DB_PASSWORD = [your password]
#   DB_DATABASE = postgres
#   DB_SSL      = true
#   DB_POOL_MAX = 5  (keep small — PgBouncer multiplexes)
#
# Storage (replaces MinIO):
#   Project Settings → Storage → S3-compatible API.
#   Copy the endpoint, access key, secret key into Render env vars.
#   OR — use Cloudflare R2 instead, which has zero egress fees
#   (recommended over Supabase Storage for cost reasons).
#
# Realtime (replaces Socket.io):
#   Project Settings → API → Copy "Project URL" + "service_role" key.
#   Set in Render:
#     SUPABASE_URL             = https://[project].supabase.co
#     SUPABASE_SERVICE_ROLE_KEY = eyJ...  (long JWT — keep secret!)
#     SUPABASE_ANON_KEY        = eyJ...  (safe to expose to frontend)
#
# Backups:
#   Free tier: 7 daily backups, no PITR.
#   Pro tier: 7-day PITR (point-in-time recovery to any second). $25/mo.
#   ENABLE PITR BEFORE onboarding real schools.
#
# RLS:
#   The migration 1780000000000-AddRlsPolicies.ts creates the policies.
#   Run `npm run migration:run` against Supabase after creation.
#   Verify in Supabase dashboard → Authentication → Policies → every
#   tenant-owned table should show a "tenant_isolation" policy.

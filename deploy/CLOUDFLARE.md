# Cloudflare setup instructions
# =========================================================================
#
# 1. Buy a domain (any registrar).
# 2. Create a free Cloudflare account at dash.cloudflare.com.
# 3. Add the domain → Cloudflare gives you 2 nameservers.
# 4. At your registrar, replace the nameservers with Cloudflare's.
# 5. Wait for activation (10 min to 24 h).
#
# DNS records to add (Cloudflare → DNS → Records):
#   ┌─────────┬──────────┬──────────────────────────────┬─────────┐
#   │ Type    │ Name     │ Target                        │ Proxy   │
#   ├─────────┼──────────┼──────────────────────────────┼─────────┤
#   │ CNAME   │ app      │ cname.vercel-dns.com          │ DNS only│
#   │ CNAME   │ api      │ your-app.onrender.com         │ DNS only│
#   │ CNAME   │ @        │ cname.vercel-dns.com          │ DNS only│
#   │ CNAME   │ www      │ cname.vercel-dns.com          │ DNS only│
#   └─────────┴──────────┴──────────────────────────────┴─────────┘
#
# 6. SSL/TLS → Overview → set mode to "Full (Strict)".
#    Both Vercel and Render terminate TLS themselves; Cloudflare
#    connects over HTTPS to them. This is the safest mode.
#
# 7. (Optional, recommended) Create a Cloudflare R2 bucket for file storage:
#    Cloudflare → R2 → Create bucket → name: schoolsync-prod
#    Settings → R2 API Tokens → Create → permissions: Object Read+Write
#    Copy the Access Key ID + Secret Access Key into Render env vars:
#       S3_ENDPOINT  = https://<account-id>.r2.cloudflarestorage.com
#       S3_ACCESS_KEY = <from R2 token>
#       S3_SECRET_KEY = <from R2 token>
#       S3_BUCKET    = schoolsync-prod
#       S3_REGION    = auto
#       S3_FORCE_PATH_STYLE = false
#       S3_PUBLIC_URL = https://pub-<id>.r2.dev  (enable public access on bucket)
#
# 8. (Optional) Cloudflare WAF rules:
#    - Block all requests except NG (Nigeria) + your office IP.
#    - Rate limit /api/v1/auth/* to 5 req/min per IP.
#    - Block SQLi patterns on /api/* (Cloudflare's managed rule).

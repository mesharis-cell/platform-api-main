# Snyk Setup Guide — Kadence Platform

Step-by-step guide to connect all 4 Kadence repos to Snyk for free, continuous dependency vulnerability scanning.

---

## Step 1: Create Snyk Account

1. Go to **https://snyk.io** and click **Sign up free**
2. Choose **Sign up with Bitbucket** (recommended — easiest integration)
3. Authorize Snyk to access your Bitbucket workspace
4. You'll land on the Snyk dashboard

> Free tier includes: unlimited open source project scans, 200 private project tests/month, PR checks, weekly email reports.

---

## Step 2: Import Repositories

1. From the Snyk dashboard, click **Add project** (top right)
2. Select **Bitbucket Cloud**
3. If not already connected, click **Connect to Bitbucket Cloud** and authorize the OAuth
4. You'll see a list of your Bitbucket repos. Select:
    - `platform-api`
    - `platform-admin`
    - `platform-client`
    - `platform-warehouse`
5. Click **Add selected repositories**
6. Snyk will auto-detect `package.json` in each repo and start the initial scan (takes 1-2 minutes)

---

## Step 3: Review Initial Results

After import, each repo appears as a project in your dashboard. Click any project to see:

- **Vulnerability count** by severity (Critical / High / Medium / Low)
- **Dependency tree** showing where vulnerabilities originate
- **Fix advice** — Snyk suggests specific version upgrades
- **Exploit maturity** — whether a known exploit exists in the wild

The initial scan may show existing vulnerabilities. That's expected — the goal is to track and reduce them over time.

---

## Step 4: Configure Automatic PR Checks

1. Go to **Settings** (gear icon, top right) → **Integrations** → **Bitbucket Cloud**
2. Under **Default Snyk test for pull requests**, ensure it's **Enabled**
3. Set **Fail conditions**: Only fail on **High** or **Critical** (recommended — don't block PRs for low-severity issues)
4. Click **Save**

Now Snyk will automatically comment on PRs that introduce new vulnerabilities.

---

## Step 5: Configure Monitoring Schedule

1. Go to **Settings** → **Organization** → **Notifications**
2. Enable **Weekly vulnerability digest** — sends an email summary every Monday
3. Enable **New vulnerability alerts** — notifies when a new CVE affects your dependencies
4. Set notification recipients (add team email if needed)

---

## Step 6: Export a Report

When you need to share a report with a client:

1. Go to **Projects** → click the repo (e.g., `platform-api`)
2. Click the **⋮** menu (three dots) → **View report**
3. The report shows all vulnerabilities with CVE references
4. Click **Export** → **PDF** or **CSV**
5. Save as: `kadence-platform-api-snyk-report-YYYY-MM-DD.pdf`

Repeat for each repo to produce 4 separate reports.

---

## Step 7: Fix Vulnerabilities (Optional)

Snyk can auto-generate fix PRs:

1. Click a vulnerability in the project view
2. If a fix is available, click **Open a fix PR**
3. Snyk creates a Bitbucket PR that upgrades the affected package
4. Review and merge as normal

For vulnerabilities without auto-fix:

- Check if a newer version of the package resolves it
- If no fix exists, click **Ignore** with a reason (e.g., "No fix available, not exploitable in our context")

---

## Quick Reference

| Action                          | How                                       |
| ------------------------------- | ----------------------------------------- |
| View all projects               | Dashboard → Projects                      |
| Run manual scan                 | Project → ⋮ → Retest now                  |
| Export PDF report               | Project → ⋮ → View report → Export → PDF  |
| See PR check results            | Bitbucket PR → Snyk status check          |
| Configure severity threshold    | Settings → Integrations → Bitbucket Cloud |
| View scan history               | Project → History tab                     |
| Get API token (if needed later) | Settings → General → API Token            |

---

## Snyk Free Tier Limits

- **200 tests/month** for private repos (each push to monitored branch = 1 test)
- **Unlimited** for open source dependencies
- **5 Snyk Code tests/month** (SAST — static code analysis, bonus feature)
- **Weekly email digests** included
- **PR checks** included
- **No credit card required**

For 4 repos with ~10 pushes/week each, you'll use ~160 tests/month — well within the free tier.

---

## Troubleshooting

**"Repository not found"** — Make sure the Bitbucket OAuth integration has access to the correct workspace. Go to Settings → Integrations → Bitbucket Cloud → Reconnect if needed.

**"No package.json detected"** — Snyk looks for `package.json` at the repo root. All 4 Kadence repos have this, so this shouldn't happen.

**"Scan timed out"** — Retry. Large dependency trees occasionally take longer on first scan.

**PR check not appearing** — Verify the integration is enabled under Settings → Integrations → Bitbucket Cloud → Pull request checks → Enabled.

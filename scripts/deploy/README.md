# Kadence deploy status scripts

Sanity-check what's actually deployed where. Use before assuming a push
took effect.

## Infra topology (memorize this)

- **AWS account**: `609230521830` ("Kadence platform")
- **Git** source-of-truth: Bitbucket (`bitbucket.org/homeofpmg/kadence-{api,admin,warehouse,client}`).
- **API** → CodePipeline watches Bitbucket via CodeConnections:
  - `kadence-api-staging-pipeline` ← Bitbucket `staging` branch → deploys to EB `kadence-api-env-staging`
  - `kadence-api-production-pipeline` ← Bitbucket `main` branch → deploys to EB `kadence-api-env-production`
  - Pipelines live in **us-east-1**, EB lives in **ap-south-1**.
- **Frontends (4 apps)** → AWS Amplify in **ap-south-1**, each connected to a Bitbucket repo branch:
  - `kadence-admin` (app `d3uxg263ljjkn`) — `bitbucket.org/homeofpmg/kadence-admin`
  - `kadence-warehouse` (app `dlqzh1t64i0in`) — `bitbucket.org/homeofpmg/kadence-warehouse`
  - `kadence-client-redbull` (app `d12ui6oezoziso`) — `bitbucket.org/homeofpmg/kadence-client`
  - `kadence-client-pernod` (app `d20fj4f9z87yys`) — same repo as above, different branding
- **No Vercel. No GitHub-main mirror deploys.** The `bitbucket-pipelines.yml` push-to-GitHub jobs are legacy and don't drive any deploy — ignore them.

## Creds

Scripts expect `AWS_PROFILE=kadence` (or env vars) resolving to account
`609230521830`. If that profile is missing, put the access key + secret from
1Password `Kadence AWS (deploy user)` under `~/.aws/credentials` as a
`[kadence]` profile.

## Scripts

```bash
# API side
bash scripts/deploy/check-codepipeline.sh                # both staging + prod pipelines latest state
bash scripts/deploy/check-eb.sh                          # both EB environments health + version
bash scripts/deploy/check-codepipeline.sh staging        # just staging
bash scripts/deploy/check-codepipeline.sh production     # just prod

# Frontend side
bash scripts/deploy/check-amplify.sh admin               # kadence-admin latest 5 jobs
bash scripts/deploy/check-amplify.sh warehouse
bash scripts/deploy/check-amplify.sh client-redbull
bash scripts/deploy/check-amplify.sh client-pernod
bash scripts/deploy/check-amplify.sh                     # all four

# Everything at once
bash scripts/deploy/check-all.sh
```

## IAM permissions checklist (for the `kadence` deploy user)

Current attached: EB + CodePipeline + CodeBuild read.
Needed: **amplify:ListApps, amplify:ListBranches, amplify:ListJobs,
amplify:GetJob, amplify:StartJob**. Add inline policy on user
`kadence-api-staging` to enable the amplify scripts.

## Authoritative vs non-authoritative signals

- **Authoritative**: CodePipeline `GetPipelineState` lastExecution status +
  EB `DescribeEnvironments` DateUpdated + VersionLabel; Amplify
  `GetJob` status.
- **Non-authoritative (don't trust as deploy signal)**: chunk filename
  last-modified header (Amplify uses immutable content-hashed filenames —
  old files stay forever). Instead, pull the current HTML and grep for a
  symbol introduced by your commit.

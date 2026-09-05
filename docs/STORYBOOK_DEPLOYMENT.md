# Storybook Vercel Deployment

The Mobile Interaction Lab is published by GitHub Actions to one existing,
shared Vercel project. `main` owns the long-lived Production deployment. Every
other branch owns an isolated Preview deployment and deterministic Vercel alias
inside that same project; it does not own or create a Vercel project. The alias
advances only when that same branch is pushed.

The stable deployment root is the primary Storybook manager URL. `/storybook/`
remains a compatibility and repository-validation path. The workflow rejects a
deployment unless unauthenticated requests to both paths return HTTP 200. Every
Storybook deployment is public and must not require authentication.

## Deployment model

- `.github/workflows/mobile-lab.yml` runs a cheap scope check on branch pushes.
  It compares against the last successful push/manual run on that same branch,
  not merely the preceding commit. Failed/canceled relevant changes therefore
  remain in the next comparison. First runs, manual retries, missing/divergent
  baselines and unknown paths build conservatively. Known documentation,
  guidance, site and test-only paths may skip an unchanged Lab. The classifier
  is `scripts/storybook-ci.mjs`; shared components, packages, dependencies,
  Vercel configuration and the Lab workflow/helpers require a build.
- A relevant push validates and builds Storybook once without Vercel credentials,
  seals the static files with a source SHA and SHA-256 inventory, and uploads a
  run-specific artifact. The deploy job downloads that same-run artifact
  and verifies all bytes and the SHA before packaging routes with Vercel.
  The artifact name uses run ID rather than attempt so retrying only the failed
  deploy job can reuse its successful validation output; rerunning validation
  replaces that run's artifact after sealing it again.
  `STORYBOOK_PREBUILT=1` makes the Vercel build command verify the existing output
  instead of repeating Lab validation or compilation. The exact-pinned CLI and
  dependencies remain covered by lockfile integrity and build-script policy.
- A push to `main` uses Production; other branches use Preview and a deterministic
  branch alias. Skipped pushes leave that branch's existing URL and deployed SHA
  unchanged. Do not claim a skipped commit was deployed. A new branch has no
  successful baseline, so it receives its own full-catalog preview. Use manual
  dispatch when a new exact-commit deployment is required despite unchanged inputs.
- Same-repository pull requests run only the base-sensitive marker check; the
  head commit's push run supplies full build evidence. Fork pull requests still
  validate/build without publishing. Deployment uses only push/manual events;
  untrusted fork pull requests never receive Vercel credentials. Distinct check
  names keep skipped fork jobs from masking the real push build result.
- Concurrency is scoped by Git ref. A newer push cancels an older in-flight run
  for the same branch without canceling deployments for other branches.
- Deleting a branch does not start a replacement deployment. Its historical
  Vercel deployments may be removed later under the project's retention policy.
- `vercel.json` disables Vercel's separate Git-triggered auto-deployment. The
  GitHub Actions workflow is the single deployment writer, avoiding duplicate
  builds for one push.
- Normal feature and review work only pushes the branch and observes that
  workflow. Do not create another Vercel project, run `vercel link`, or run
  `vercel deploy` locally. Manual `workflow_dispatch` is the only supported
  deployment retry path.

The generated `.vercel/` link data and `apps/mobile-lab/storybook-static/`
bundle are local or CI artifacts and remain untracked.

## Repository-owner-only one-time Vercel setup

This provisioning is already complete for the repository. It is not part of a
feature branch, Storybook review, or ordinary deployment recovery workflow. Do
not repeat it unless the repository owner is intentionally replacing the
shared Interaction Lab project.

1. Create or choose a Vercel team and create a project dedicated to the
   Interaction Lab, for example `chessticize-mobile-storybook`.
2. Use the repository root as the Vercel project root. `vercel.json` supplies
   the install command, validated Storybook build command, output directory,
   root and `/storybook/` routing, and Git deployment policy.
3. Set the Production branch to `main`.
4. Connect `Chessticize/chessticize-mobile` under **Project Settings > Git** so
   deployments retain Git source metadata. The committed
   `git.deploymentEnabled: false` setting keeps Vercel from starting its own
   duplicate builds; GitHub Actions deploys with explicit Git metadata and
   assigns the stable Preview alias itself.
5. Under **Project Settings > Deployment Protection**, leave Production and
   Preview URLs publicly accessible. Do not enable Vercel Authentication or
   password protection for this project. Public access is a repository review
   gate, not an optional convenience.
6. Assign `storybook.chessticize.com` to Production. The workflow treats
   `https://storybook.chessticize.com/` as the maintained `main` catalog and
   fails a Production deployment unless both that root URL and its
   `/storybook/` compatibility path return HTTP 200.

The deterministic Preview alias is derived from the full Git branch name. A
readable, DNS-safe prefix makes the URL recognizable, while an eight-character
SHA-256 suffix prevents truncated or similarly named branches from colliding.
Updating one alias therefore never moves another branch's review URL.

## Values to add to GitHub

Create a Vercel access token from **Account or Team Settings > Tokens**. Scope
it to the team that owns the Storybook project and give it an expiration date.
Do not paste the token into an issue, PR, repository file, or chat.

Only during that initial provisioning or an owner-directed project replacement,
a project owner can run:

```sh
pnpm install --frozen-lockfile
pnpm exec vercel login
pnpm exec vercel link
```

The ignored `.vercel/project.json` file contains `orgId` and `projectId`. Add
the following as GitHub repository Actions secrets under **Settings > Secrets
and variables > Actions**:

| GitHub secret | Value |
| --- | --- |
| `VERCEL_TEAM_TOKEN` | A Vercel access token scoped to all projects in the owning team |
| `VERCEL_ORG_ID` | `.vercel/project.json` `orgId` |
| `VERCEL_PROJECT_ID` | `.vercel/project.json` `projectId` |

The workflow fails before contacting Vercel when any required secret is absent.
Rotate `VERCEL_TEAM_TOKEN` before it expires by replacing the GitHub secret; no
code change is required.

The deploy job does not expose these credentials while installing JavaScript
dependencies or building Storybook. It injects them only into the three steps
that validate credentials, pull project settings, or contact Vercel to deploy.
The local Vercel packaging step uses already-pulled project settings without an
authentication token. It verifies the downloaded static output; it does not
recompile the Lab. The source manifest is published as `codex-build.json`, and
the access step checks its SHA at both immutable and branch URLs.

## First deployment

1. Add the three repository secrets.
2. Push this workflow branch. Its normal `push` run validates the complete
   Interaction Lab and creates the branch's Preview deployment.
3. Open the workflow run summary and follow the stable Storybook manager URL.
   The exact deployment URL is recorded separately for commit-level evidence.
4. Open the same root URL in a signed-out or private browser window. The
   workflow has already checked HTTP 200 at both the root and `/storybook/`
   without credentials; the browser check confirms the visible manager and
   story assets load correctly.
5. Confirm the Vercel deployment shows the expected Git branch and exact commit
   SHA. Share the stable branch URL, not a URL owned by another branch.
6. After this change reaches `main`, the next `main` push publishes Production.
   Record that stable Production URL as the maintained main catalog.

To retry a branch without changing source, open **Actions > Mobile Interaction
Lab > Run workflow**, select the branch, and run it. A manual run uses the same
Preview-versus-Production rule as a push.

## Pull-request handoff

Record all of the following in the PR:

- Storybook source branch and exact 40-character commit SHA.
- Stable Vercel branch manager root URL assigned by the workflow for that exact
  branch.
- Direct Storybook story URL for the changed scenario.
- The successful GitHub Actions run and its anonymous HTTP 200 result.

A Vercel deployment is review evidence only. It does not itself approve a UI
design or authorize product wiring.

## Troubleshooting

- **Missing-secret error:** add or rotate all three GitHub Actions secrets. The
  token, organization ID, and project ID must belong to the same Vercel scope.
- **HTTP 401 or 403:** disable Deployment Protection for both Preview and
  Production, redeploy, and require an unauthenticated HTTP 200 before handoff.
- **HTTP 404 at `/storybook/`:** verify the Vercel project root is the repository
  root and that the deployment used the committed `vercel.json`.
- **No stable branch URL:** inspect the `vercel alias set` step, confirm the team
  token can assign aliases in the project, and verify that the deployment
  metadata shows `githubCommitRef`. Exact commit URLs alone do not replace the
  branch-owned review URL.
- **Production custom domain fails:** verify that `storybook.chessticize.com`
  is assigned to the project Production environment, then require anonymous
  HTTP 200 at both `https://storybook.chessticize.com/` and its `/storybook/`
  compatibility path.
- **Two Vercel deployments for one push:** verify the deployed commit contains
  `git.deploymentEnabled: false` and that no second Vercel project is connected
  to the repository.
- **A newer push cancels the run:** this is expected only within the same branch.
  Pushes to different branches have independent concurrency groups.

## Vercel references

- [GitHub Actions with Vercel](https://vercel.com/kb/guide/how-can-i-use-github-actions-with-vercel)
- [Git branch metadata for CLI deployments](https://vercel.com/kb/guide/branch-variables-and-domains-not-linked-to-cli-deployments)
- [Disable provider-side Git deployments](https://vercel.com/docs/project-configuration/git-configuration#turning-off-all-automatic-deployments)
- [Pull branch-specific Preview settings](https://vercel.com/docs/cli/pull)
- [Assign a stable alias](https://vercel.com/docs/cli/alias)
- [Deployment Protection](https://vercel.com/docs/deployment-protection)

# Storybook Vercel Deployment

The Mobile Interaction Lab is published by GitHub Actions to one dedicated
Vercel project. `main` owns the long-lived Production deployment. Every other
branch owns an isolated Preview deployment and Vercel branch URL that advances
only when that same branch is pushed.

The deployment entry point is always `/storybook/`. The project root redirects
there, and the workflow rejects a deployment unless an unauthenticated request
to that path returns HTTP 200. Every Storybook deployment is public and must
not require authentication.

## Deployment model

- `.github/workflows/mobile-lab.yml` validates every branch push, builds with a
  pinned Vercel CLI, and uploads the prebuilt output from that exact commit.
- A push to `main` uses the Vercel Production environment and updates the
  project's stable Production domain.
- A push to any other branch uses the Vercel Preview environment. Git metadata
  binds the deployment to that branch so its stable branch URL follows later
  pushes without overwriting another branch.
- Pull requests still run the Interaction Lab validation job. Deployment uses
  only `push` or manual `workflow_dispatch` events, so untrusted fork pull
  requests never receive Vercel credentials.
- Concurrency is scoped by Git ref. A newer push cancels an older in-flight run
  for the same branch without canceling deployments for other branches.
- Deleting a branch does not start a replacement deployment. Its historical
  Vercel deployments may be removed later under the project's retention policy.
- `vercel.json` disables Vercel's separate Git-triggered auto-deployment. The
  GitHub Actions workflow is the single deployment writer, avoiding duplicate
  builds for one push.

The generated `.vercel/` link data and `apps/mobile-lab/storybook-static/`
bundle are local or CI artifacts and remain untracked.

## One-time Vercel setup

1. Create or choose a Vercel team and create a project dedicated to the
   Interaction Lab, for example `chessticize-mobile-storybook`.
2. Use the repository root as the Vercel project root. `vercel.json` supplies
   the install command, validated Storybook build command, output directory,
   `/storybook/` routing, and Git deployment policy.
3. Set the Production branch to `main`.
4. Connect `Chessticize/chessticize-mobile` under **Project Settings > Git** so
   Vercel can maintain generated branch URLs. The committed
   `git.deploymentEnabled: false` setting keeps Vercel from starting its own
   duplicate builds; GitHub Actions still deploys with explicit Git metadata.
5. Under **Project Settings > Deployment Protection**, leave Production and
   Preview URLs publicly accessible. Do not enable Vercel Authentication or
   password protection for this project. Public access is a repository review
   gate, not an optional convenience.
6. If desired, assign a custom domain to Production. This becomes the stable
   `main` catalog URL; Vercel's default Production domain also remains stable.

Vercel currently restricts connecting GitHub organization repositories to
Hobby teams. The repository is public, but the supported setup for generated
branch URLs is still a Vercel team/plan that can connect the organization
repository. CLI deployments to an unconnected project can still produce exact
deployment URLs, but they do not satisfy this repository's stable branch-URL
contract. A wildcard custom domain with CI-managed aliases would be the
alternative if the project must remain unconnected.

## Values to add to GitHub

Create a Vercel access token from **Account or Team Settings > Tokens**. Scope
it to the team that owns the Storybook project and give it an expiration date.
Do not paste the token into an issue, PR, repository file, or chat.

From the repository root, a project owner can run:

```sh
pnpm dlx vercel@58.4.4 login
pnpm dlx vercel@58.4.4 link
```

The ignored `.vercel/project.json` file contains `orgId` and `projectId`. Add
the following as GitHub repository Actions secrets under **Settings > Secrets
and variables > Actions**:

| GitHub secret | Value |
| --- | --- |
| `VERCEL_TOKEN` | The Vercel access token |
| `VERCEL_ORG_ID` | `.vercel/project.json` `orgId` |
| `VERCEL_PROJECT_ID` | `.vercel/project.json` `projectId` |

The workflow fails before contacting Vercel when any required secret is absent.
Rotate `VERCEL_TOKEN` before it expires by replacing the GitHub secret; no code
change is required.

## First deployment

1. Add the three repository secrets.
2. Push this workflow branch. Its normal `push` run validates the complete
   Interaction Lab and creates the branch's Preview deployment.
3. Open the workflow run summary and follow the Storybook manager URL.
4. Open the same `/storybook/` URL in a signed-out or private browser window.
   The workflow has already checked HTTP 200 without credentials; the browser
   check confirms the visible manager and story assets load correctly.
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
- Stable Vercel branch manager URL ending in `/storybook/`.
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
- **No stable branch URL:** connect the GitHub repository to the Vercel project
  and verify that the deployment metadata shows `githubCommitRef`. Exact commit
  URLs alone do not replace the branch-owned review URL.
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
- [Deployment Protection](https://vercel.com/docs/deployment-protection)

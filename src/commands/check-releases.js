import { listApps } from '../registry.js';
import {
  latestSemverTag,
  publishedVersion,
  compareSemverTag,
  tagToVersion,
} from '../fetch.js';

// Compare each registered app's latest git tag against the version currently
// live at R2. Emit the list of apps where git has something newer — that's
// what the scheduled release workflow hands to its build matrix.
//
// --json: print the matrix as JSON (one line, compact) for consumption by
//         GitHub Actions' fromJSON(). Human-readable table otherwise.
export async function checkReleasesCommand(args) {
  const asJson = args.includes('--json');
  const apps = listApps();

  const plans = [];
  const rows = [];

  for (const [name, app] of apps) {
    if (!app.repo) {
      rows.push({ app: name, status: 'skip: no repo' });
      continue;
    }

    let tag;
    try {
      tag = latestSemverTag(app.repo);
    } catch (err) {
      rows.push({ app: name, status: `gh api failed: ${shortErr(err)}` });
      continue;
    }

    if (!tag) {
      rows.push({ app: name, status: 'skip: no v* tag yet' });
      continue;
    }

    let live;
    try {
      live = await publishedVersion({
        slug: app.slug,
        app: name,
        framework: app.framework,
      });
    } catch (err) {
      rows.push({ app: name, status: `r2 check failed: ${shortErr(err)}`, tag });
      continue;
    }

    const tagVer = tagToVersion(tag);
    const needsPublish = live === null || compareSemverTag(`v${tagVer}`, `v${live}`) > 0;

    rows.push({
      app: name,
      tag,
      live: live ?? '(none)',
      status: needsPublish ? 'NEEDS PUBLISH' : 'up to date',
    });

    if (needsPublish) {
      plans.push({
        app: name,
        tag,
        repo: app.repo,
        framework: app.framework,
      });
    }
  }

  if (asJson) {
    // Write the matrix on a single line so GitHub Actions' $GITHUB_OUTPUT
    // capture works without multi-line heredoc wrangling.
    process.stdout.write(JSON.stringify(plans) + '\n');
    return;
  }

  if (rows.length === 0) {
    console.log('No apps registered.');
    return;
  }
  console.table(rows);
  if (plans.length > 0) {
    console.log(`\n${plans.length} app(s) need publishing.`);
  }
}

function shortErr(err) {
  const m = String(err.message ?? err).split('\n')[0];
  return m.slice(0, 80);
}

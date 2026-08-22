import { createApp } from '../src/server.mjs';

/**
 * Serve the one-page answer view with a run already in it.
 *
 * The view renders a run or it renders an empty state, so opening the page cold shows the
 * empty state and nothing else. This seeds the factory first — a healthy v1 run by default,
 * or the break/repair modes — then hands over the URL.
 */

const MODES = ['normal', 'break-x', 'repaired', 'lifecycle'];

function argValue(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? fallback : process.argv[index + 1];
}

const mode = argValue('mode', 'normal');
if (!MODES.includes(mode)) {
  console.error(`mode must be one of ${MODES.join(', ')}`);
  process.exit(1);
}

const port = Number(argValue('port', process.env.PORT ?? 3000));
const app = createApp();

async function seed(base, runMode, runId, factoryVersion) {
  const response = await fetch(`${base}/mend/runs`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ mode: runMode, runId, factoryVersion }),
  });
  if (!response.ok) throw new Error(`seeding ${runMode} failed with HTTP ${response.status}`);
  const run = await response.json();
  console.log(`  ${runMode.padEnd(8)} → ${run.status} · ${run.publishStatus}${run.failedAxes.length ? ` · failed ${run.failedAxes.join(',')}` : ''}`);
  return run;
}

app.server.listen(port, async () => {
  const base = `http://localhost:${port}`;
  try {
    console.log('Seeding the factory:');
    if (mode === 'lifecycle') {
      // The whole demo in order, so the page ends on the repaired v2 run.
      await seed(base, 'normal', 'mend-v1-healthy', 'v1');
      await seed(base, 'break-x', 'mend-v1-x-failed', 'v1');
      await seed(base, 'repaired', 'mend-v2-recovered', 'v2');
    } else {
      await seed(base, mode, `mend-site-${mode}`, mode === 'repaired' ? 'v2' : 'v1');
    }
    console.log(`\nAnswer view:  ${base}/mend`);
    console.log(`Run JSON:     ${base}/mend/target`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
    app.server.close();
  }
});

async function stop() {
  app.server.close(async () => {
    await app.telemetry.shutdown();
    process.exit(0);
  });
}
process.on('SIGINT', stop);
process.on('SIGTERM', stop);

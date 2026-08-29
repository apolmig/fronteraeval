const ORIGIN = process.env.PUBLIC_ORIGIN || 'https://fronteraeval.org';
const configResponse = await fetch(`${ORIGIN}/indexnow-urls.json?ts=${Date.now()}`, {
  headers: {'user-agent':'FronteraEval/0.9 discovery notifier'}
});
if (!configResponse.ok) throw new Error(`Could not fetch deployed IndexNow list: ${configResponse.status}`);

const config = await configResponse.json();
if (config.host !== 'fronteraeval.org' || !config.key || !Array.isArray(config.urlList) || config.urlList.length === 0) {
  throw new Error('Invalid IndexNow configuration');
}

const payload = {
  host: config.host,
  key: config.key,
  keyLocation: config.keyLocation,
  urlList: config.urlList.slice(0, 10000)
};

const endpoint = 'https://api.indexnow.org/indexnow';
const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
let lastStatus = null;
let lastBody = '';

for (let attempt = 1; attempt <= 6; attempt += 1) {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'user-agent': 'FronteraEval/0.9 discovery notifier'
    },
    body: JSON.stringify(payload)
  });
  lastStatus = response.status;
  lastBody = await response.text();

  if ([200, 202].includes(response.status)) {
    console.log(JSON.stringify({status: response.status, submitted: payload.urlList.length, attempt}));
    process.exit(0);
  }

  let errorCode = null;
  try { errorCode = JSON.parse(lastBody)?.errorCode || null; } catch {}
  const verificationPending = response.status === 403 && errorCode === 'SiteVerificationNotCompleted';
  if (!verificationPending) {
    throw new Error(`IndexNow submission failed: ${response.status} ${lastBody}`);
  }

  if (attempt < 6) {
    console.log(`IndexNow verification is pending; retrying in 30 seconds (${attempt}/6).`);
    await sleep(30000);
  }
}

// IndexNow is an optional discovery accelerator, not a publication dependency.
// The key is publicly reachable and the weekly workflow will retry on its next run.
console.warn(`::warning::IndexNow verification remains pending after retries (${lastStatus} ${lastBody}).`);
console.log(JSON.stringify({status:'pending-site-verification', submitted:0, queued_urls:payload.urlList.length}));

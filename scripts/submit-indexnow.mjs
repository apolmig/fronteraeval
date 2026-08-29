const ORIGIN = process.env.PUBLIC_ORIGIN || 'https://fronteraeval.org';
const configResponse = await fetch(`${ORIGIN}/indexnow-urls.json?ts=${Date.now()}`, {headers:{'user-agent':'FronteraEval/0.9 discovery notifier'}});
if (!configResponse.ok) throw new Error(`Could not fetch deployed IndexNow list: ${configResponse.status}`);
const config = await configResponse.json();
if (config.host !== 'fronteraeval.org' || !config.key || !Array.isArray(config.urlList) || config.urlList.length === 0) throw new Error('Invalid IndexNow configuration');
const payload = {host:config.host,key:config.key,keyLocation:config.keyLocation,urlList:config.urlList.slice(0,10000)};
const response = await fetch('https://api.indexnow.org/indexnow', {method:'POST',headers:{'content-type':'application/json; charset=utf-8','user-agent':'FronteraEval/0.9 discovery notifier'},body:JSON.stringify(payload)});
if (![200,202].includes(response.status)) throw new Error(`IndexNow submission failed: ${response.status} ${await response.text()}`);
console.log(JSON.stringify({status:response.status,submitted:payload.urlList.length}));

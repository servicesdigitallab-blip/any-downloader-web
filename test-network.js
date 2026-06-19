const urls = [
  'https://www.google.com',
  'https://www.youtube.com',
  'https://co.wuk.sh/api/json',
  'https://api.cobalt.tools/api/json',
  'https://invidious.nerdvpn.de'
];

async function test() {
  for (const url of urls) {
    console.log(`\nFetching: ${url}`);
    try {
      const res = await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(3000) });
      console.log(`[Success] Status: ${res.status}`);
    } catch (e) {
      console.error(`[Failed] Error: ${e.message}`, e.stack);
    }
  }
}

test();

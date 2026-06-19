async function test() {
  try {
    const url = 'https://cobalt.directory/';
    console.log(`Fetching page: ${url}`);
    const res = await fetch(url, { signal: AbortSignal.timeout(4000) });
    const html = await res.text();
    
    // Extract the sveltekit data block
    const regex = /data:\[null,\{type:"data",data:\{instances:(.+?)\}\}\]/g;
    const match = html.match(/instances:\[(.+?)\]/);
    if (match) {
      console.log('Found instances list data! First 1500 chars:');
      console.log(match[0].substring(0, 1500));
    } else {
      console.log('No matches, printing sveltekit start script:');
      const startScript = html.substring(html.indexOf('__sveltekit'));
      console.log(startScript.substring(0, 2000));
    }
  } catch (e) {
    console.error('Error:', e.message);
  }
}
test();

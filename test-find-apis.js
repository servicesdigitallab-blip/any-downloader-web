async function test() {
  try {
    const res = await fetch('https://cobalt.directory/', { signal: AbortSignal.timeout(4000) });
    const html = await res.text();
    
    // Find all occurrences of apiHost:"..."
    const regex = /(apiHost|api):"([^"]+)"/g;
    let match;
    const hosts = [];
    while ((match = regex.exec(html)) !== null) {
      hosts.push(match[2]);
    }
    
    console.log('Found apiHost entries count:', hosts.length);
    console.log('Found apiHost entries:', [...new Set(hosts)]);
  } catch (e) {
    console.error('Error:', e.message, e.stack);
  }
}
test();

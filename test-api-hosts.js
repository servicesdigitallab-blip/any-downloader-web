async function test() {
  try {
    const res = await fetch('https://cobalt.directory/', { signal: AbortSignal.timeout(4000) });
    const html = await res.text();
    
    // Find all occurrences of apiHost:"..." or api:"..."
    const regex = /(apiHost|api):"([^"]+)"/g;
    let match;
    const hosts = [];
    while ((match = regex.exec(html)) !== null) {
      hosts.push(match[2]);
    }
    
    console.log('Found API hosts:', [...new Set(hosts)]);
  } catch (e) {
    console.error('Error:', e.message);
  }
}
test();

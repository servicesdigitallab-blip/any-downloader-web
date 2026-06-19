async function test() {
  const url = 'https://cobalt.directory/';
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(4000) });
    const html = await res.text();
    
    // Find all links
    const regex = /href="([^"]+)"/g;
    let match;
    const links = [];
    while ((match = regex.exec(html)) !== null) {
      links.push(match[1]);
    }
    
    console.log('All links found:', links.filter(l => l.includes('sweeux') || l.includes('canine') || l.includes('boo') || l.includes('clxxped') || l.includes('blackcat') || l.includes('cjs') || l.includes('de')));
  } catch (e) {
    console.error('Error:', e.message, e.stack);
  }
}
test();

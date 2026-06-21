const instances = [
  'https://blossom.imput.net',
  'https://kityune.imput.net',
  'https://nachos.imput.net',
  'https://sunny.imput.net',
  'https://cobalt.alpha.wolfy.love',
  'https://melon.clxxped.lol',
  'https://nuko-c.meowing.de',
  'https://api.cobalt.blackcat.sweeux.org',
  'https://grapefruit.clxxped.lol',
  'https://cobaltapi.squair.xyz',
  'https://cobalt.omega.wolfy.love',
  'https://lime.clxxped.lol',
  'https://api.qwkuns.me',
  'https://dog.kittycat.boo',
  'https://cobaltapi.kittycat.boo',
  'https://rue-cobalt.xenon.zone',
  'https://fox.kittycat.boo',
  'https://cobaltapi.cjs.nz',
  'https://cookie.br0k3.me',
  'https://pizza.br0k3.me',
  'https://api.cobalt.liubquanti.click',
  'https://subito-c.meowing.de',
  'https://apicobalt.mgytr.top',
  'https://api.dl.woof.monster'
];

async function testCobalt() {
  const url = 'https://www.youtube.com/watch?v=JPuUv3uzFiY';
  
  for (const instance of instances) {
    try {
      console.log(`\nQuerying ${instance}...`);
      const response = await fetch(instance, {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
        },
        body: JSON.stringify({
          url,
          vQuality: '1080',
          isAudioOnly: false
        }),
        signal: AbortSignal.timeout(6000)
      });
      
      console.log('Status:', response.status);
      const data = await response.json();
      console.log('Data:', data);
    } catch (err) {
      console.error('Error:', err.message);
    }
  }
}

testCobalt();

import { Innertube, Platform } from 'youtubei.js';

Platform.shim.eval = (code, env) => {
  const fn = new Function('env', `${code.output}\nreturn { ...env };`);
  return fn(env);
};

async function testTv() {
  const innertube = await Innertube.create();
  const videoId = 'JPuUv3uzFiY';
  
  const clients = ['TV', 'ANDROID', 'MWEB', 'WEB'];
  for (const client of clients) {
    try {
      console.log(`\nTesting client: ${client}`);
      const videoInfo = await innertube.getInfo(videoId, { client });
      console.log('basic_info.title:', videoInfo.basic_info.title);
      console.log('basic_info.duration:', videoInfo.basic_info.duration);
    } catch (e) {
      console.error(`Client ${client} error:`, e.message);
    }
  }
}

testTv();

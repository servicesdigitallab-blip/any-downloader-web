import express from 'express';
import cors from 'cors';
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import ytdl from '@distube/ytdl-core';
import { Innertube, Platform } from 'youtubei.js';

// Setup custom evaluator for deciphering signatures in Node/Vercel
Platform.shim.eval = (code, env) => {
  const fn = new Function('env', `${code.output}\nreturn { ...env };`);
  return fn(env);
};

let youtubeClient = null;
async function getYoutubeClient() {
  if (!youtubeClient) {
    youtubeClient = await Innertube.create();
  }
  return youtubeClient;
}

// Function to extract YouTube Video ID
function getYouTubeID(url) {
  try {
    const parsed = new URL(url);
    if (parsed.hostname.includes('youtu.be')) {
      return parsed.pathname.substring(1);
    }
    if (parsed.searchParams.has('v')) {
      return parsed.searchParams.get('v');
    }
    const pathParts = parsed.pathname.split('/');
    const shortsIndex = pathParts.indexOf('shorts');
    if (shortsIndex !== -1 && pathParts[shortsIndex + 1]) {
      return pathParts[shortsIndex + 1];
    }
    const embedIndex = pathParts.indexOf('embed');
    if (embedIndex !== -1 && pathParts[embedIndex + 1]) {
      return pathParts[embedIndex + 1];
    }
    return ytdl.getVideoID(url);
  } catch (e) {
    try {
      return ytdl.getVideoID(url);
    } catch (err) {
      return null;
    }
  }
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 5000;

// Setup directories
const isVercel = process.env.VERCEL === '1' || !!process.env.VERCEL;
let BIN_DIR = path.join(__dirname, 'bin');
if (isVercel && !fs.existsSync(BIN_DIR) && fs.existsSync(path.join(__dirname, '..', 'bin'))) {
  BIN_DIR = path.join(__dirname, '..', 'bin');
}
const DOWNLOADS_DIR = isVercel ? '/tmp' : path.join(__dirname, 'downloads');
const YTDLP_PATH = path.join(BIN_DIR, process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp');
const FFMPEG_DIR = BIN_DIR; // ffmpeg.exe is in bin/

if (!isVercel && !fs.existsSync(DOWNLOADS_DIR)) {
  fs.mkdirSync(DOWNLOADS_DIR, { recursive: true });
}

app.use(cors({
  exposedHeaders: ['Content-Length', 'Content-Range']
}));
app.use(express.json());

// In-memory jobs store
const jobs = new Map();

// Helper: Restrict strictly to YouTube, TikTok, Pinterest, Instagram
function isAllowedPlatform(urlString) {
  try {
    const url = new URL(urlString);
    const hostname = url.hostname.toLowerCase();
    return (
      hostname.includes('youtube.com') ||
      hostname.includes('youtu.be') ||
      hostname.includes('tiktok.com') ||
      hostname.includes('pinterest.com') ||
      hostname.includes('pin.it') ||
      hostname.includes('instagram.com')
    );
  } catch (e) {
    return false;
  }
}

// Format duration from seconds to MM:SS or HH:MM:SS
function formatDuration(seconds) {
  if (!seconds) return '0:00';
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  const pad = (num) => String(num).padStart(2, '0');

  if (hrs > 0) {
    return `${hrs}:${pad(mins)}:${pad(secs)}`;
  }
  return `${mins}:${pad(secs)}`;
}

app.get('/api/debug', (req, res) => {
  try {
    const debugInfo = {
      platform: process.platform,
      arch: process.arch,
      nodeVersion: process.version,
      __dirname,
      existsLocalBin: fs.existsSync(path.join(__dirname, 'bin')),
      existsLocalYtdlp: fs.existsSync(path.join(__dirname, 'bin/yt-dlp')),
      existsParentBin: fs.existsSync(path.join(__dirname, '..', 'bin')),
      existsParentYtdlp: fs.existsSync(path.join(__dirname, '..', 'bin/yt-dlp')),
      cwd: process.cwd(),
      envVercel: process.env.VERCEL,
      envNodeEnv: process.env.NODE_ENV
    };

    if (fs.existsSync('/var/task')) {
      debugInfo.varTaskContents = fs.readdirSync('/var/task');
    }
    if (fs.existsSync('/var/task/api')) {
      debugInfo.varTaskApiContents = fs.readdirSync('/var/task/api');
    }
    
    res.json(debugInfo);
  } catch (err) {
    res.status(500).json({ error: err.message, stack: err.stack });
  }
});

// Helper: Resolve download via community Cobalt API v10 with dynamic scanning
async function getCobaltInstances() {
  const verifiedInstances = [
    'https://rue-cobalt.xenon.zone',
    'https://cobaltapi.kittycat.boo',
    'https://dog.kittycat.boo',
    'https://fox.kittycat.boo',
    'https://api.cobalt.blackcat.sweeux.org'
  ];

  const staticInstances = [
    'https://rue-cobalt.xenon.zone',
    'https://cobaltapi.kittycat.boo',
    'https://dog.kittycat.boo',
    'https://fox.kittycat.boo',
    'https://api.cobalt.blackcat.sweeux.org',
    'https://cobaltapi.cjs.nz',
    'https://sunny.imput.net',
    'https://kityune.imput.net',
    'https://nachos.imput.net',
    'https://blossom.imput.net',
    'https://subito-c.meowing.de'
  ];

  try {
    console.log('Fetching active Cobalt instances dynamically from cobalt.directory...');
    const res = await fetch('https://cobalt.directory/', { 
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
      },
      signal: AbortSignal.timeout(3000) 
    });
    if (res.ok) {
      const html = await res.text();
      const regex = /(apiHost|api):"([^"]+)"/g;
      let match;
      const scraped = [];
      while ((match = regex.exec(html)) !== null) {
        const host = match[2];
        const lowercaseHost = host.toLowerCase();
        // Filter out known private or JWT-requiring instances based on our tests
        if (
          lowercaseHost.includes('alpha') ||
          lowercaseHost.includes('omega') ||
          lowercaseHost.includes('melon') ||
          lowercaseHost.includes('grapefruit') ||
          lowercaseHost.includes('lime') ||
          lowercaseHost.includes('squair') ||
          lowercaseHost.includes('qwkuns') ||
          lowercaseHost.includes('mgytr')
        ) {
          continue;
        }
        scraped.push(`https://${host}`);
      }

      if (scraped.length > 0) {
        const combined = [...new Set([...verifiedInstances, ...scraped, ...staticInstances])];
        console.log(`Successfully retrieved ${scraped.length} dynamic Cobalt instances. Total pool: ${combined.length}`);
        return combined;
      }
    }
  } catch (e) {
    console.warn('Failed to fetch dynamic Cobalt instances, using static list:', e.message);
  }

  return staticInstances;
}

// Helper: Resolve download via community Cobalt API v10 in parallel
async function fetchFromCobalt(videoUrl, quality) {
  let videoQuality = '1080';
  let downloadMode = 'auto';

  if (quality === 'audio') {
    downloadMode = 'audio';
  } else {
    const cleanQuality = quality.replace('p', '');
    if (cleanQuality === '4k' || cleanQuality === '2160') {
      videoQuality = '2160';
    } else if (cleanQuality === '2k' || cleanQuality === '1440') {
      videoQuality = '1440';
    } else if (['1080', '720', '480', '360', '240', '144'].includes(cleanQuality)) {
      videoQuality = cleanQuality;
    } else {
      videoQuality = '1080';
    }
  }

  const instances = await getCobaltInstances();
  // Try up to 8 instances in parallel to prevent sequential timeout stacking
  const targetInstances = instances.slice(0, 8);
  console.log(`Querying ${targetInstances.length} Cobalt instances in parallel in backend...`);

  const promises = targetInstances.map(async (instance) => {
    try {
      const response = await fetch(instance, {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
        },
        body: JSON.stringify({
          url: videoUrl,
          videoQuality: videoQuality,
          downloadMode: downloadMode
        }),
        signal: AbortSignal.timeout(10000) // 10.0s timeout per instance
      });

      if (response.ok) {
        const data = await response.json();
        if (data && (data.status === 'redirect' || data.status === 'tunnel' || data.url)) {
          return {
            url: data.url,
            filename: data.filename || `download.${quality === 'audio' ? 'mp3' : 'mp4'}`,
            instance
          };
        } else if (data && data.status === 'picker' && data.picker && data.picker.length > 0) {
          const item = data.picker.find(p => p.type === 'video') || data.picker[0];
          return {
            url: item.url,
            filename: data.filename || `download.${quality === 'audio' ? 'mp3' : 'mp4'}`,
            instance
          };
        }
      } else {
        const errData = await response.json().catch(() => ({}));
        throw new Error(`Instance ${instance} returned status ${response.status}: ${JSON.stringify(errData)}`);
      }
    } catch (err) {
      throw err;
    }
  });

  try {
    const result = await Promise.any(promises);
    console.log(`Backend parallel Cobalt fetch succeeded with: ${result.instance}`);
    return {
      url: result.url,
      filename: result.filename
    };
  } catch (err) {
    console.error('All parallel Cobalt instances failed in backend:', err.message);
    throw new Error('All community Cobalt instances failed to process this video.');
  }
}

// Helper: Get content length of a URL (supporting HEAD and GET with Range fallback)
async function getContentLength(streamUrl) {
  try {
    const response = await fetch(streamUrl, {
      method: 'HEAD',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(3000)
    });
    if (response.ok) {
      const len = parseInt(response.headers.get('content-length'), 10);
      if (len && !isNaN(len) && len > 0) {
        return len;
      }
    }
  } catch (err) {
    console.warn(`HEAD request failed for content-length: ${err.message}. Trying GET with Range header...`);
  }

  try {
    const response = await fetch(streamUrl, {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Range': 'bytes=0-0'
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(3000)
    });
    if (response.ok || response.status === 206) {
      const contentRange = response.headers.get('content-range');
      if (contentRange) {
        const parts = contentRange.split('/');
        if (parts.length > 1) {
          const totalSize = parseInt(parts[1], 10);
          if (totalSize && !isNaN(totalSize) && totalSize > 0) {
            return totalSize;
          }
        }
      }
      const len = parseInt(response.headers.get('content-length'), 10);
      if (len && !isNaN(len) && len > 0) {
        return len;
      }
    }
  } catch (err) {
    console.warn(`GET Range request failed for content-length: ${err.message}`);
  }
  return 0;
}

// Helper: Parse duration from HTML page metadata (JSON-LD, itemprop, og:video:duration)
function parseDurationFromHtml(html) {
  try {
    // 1. Try JSON-LD or schema duration (commonly found in TikTok, Instagram, Pinterest)
    const matchLd = html.match(/"duration"\s*:\s*"([^"]+)"/i);
    if (matchLd && matchLd[1]) {
      const val = matchLd[1];
      if (val.startsWith('PT')) {
        const sec = parseISO8601Duration(val);
        if (sec > 0) return sec;
      } else {
        const sec = parseFloat(val);
        if (!isNaN(sec) && sec > 0) return Math.round(sec);
      }
    }

    // 2. itemprop="duration"
    const matchItemprop = html.match(/itemprop="duration"\s+content="([^"]+)"/i) ||
                          html.match(/content="([^"]+)"\s+itemprop="duration"/i);
    if (matchItemprop && matchItemprop[1]) {
      const sec = parseISO8601Duration(matchItemprop[1]);
      if (sec > 0) return sec;
    }

    // 3. og:video:duration meta tags
    const ogDurationMatch = html.match(/<meta\s+property=["'](?:og:)?video:duration["']\s+content=["']([^"']+)["']/i) ||
                            html.match(/<meta\s+content=["']([^"']+)["']\s+property=["'](?:og:)?video:duration["']/i) ||
                            html.match(/<meta\s+name=["']twitter:player:duration["']\s+content=["']([^"']+)["']/i) ||
                            html.match(/<meta\s+content=["']([^"']+)["']\s+name=["']twitter:player:duration["']/i);
    if (ogDurationMatch && ogDurationMatch[1]) {
      const sec = parseFloat(ogDurationMatch[1]);
      if (!isNaN(sec) && sec > 0) return Math.round(sec);
    }

    // 4. approxDurationMs or durationMs
    const approxDurationMatch = html.match(/"approxDurationMs"\s*:\s*"(\d+)"/i) ||
                                html.match(/"durationMs"\s*:\s*(\d+)/i) ||
                                html.match(/"duration"\s*:\s*(\d+)/i);
    if (approxDurationMatch && approxDurationMatch[1]) {
      const val = parseInt(approxDurationMatch[1], 10);
      if (val > 0) {
        return val > 100000 ? Math.round(val / 1000) : val;
      }
    }
  } catch (err) {
    console.warn('Error parsing duration from HTML:', err.message);
  }
  return 0;
}

// Cache for analyzed URLs to make repeated requests instant
const infoCache = new Map();

// Clean up cache periodically to avoid memory leaks
setInterval(() => {
  if (infoCache.size > 200) {
    const keys = Array.from(infoCache.keys());
    for (let i = 0; i < keys.length - 200; i++) {
      infoCache.delete(keys[i]);
    }
  }
}, 60000);

// Helper: Scrape Open Graph metadata for TikTok/Instagram/Pinterest
async function scrapeOpenGraphMetadata(url, platform) {
  try {
    const controller = new AbortController();
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5'
      },
      signal: controller.signal
    });

    if (!response.ok) {
      throw new Error(`HTTP status ${response.status}`);
    }

    let buffer = '';
    const decoder = new TextDecoder('utf-8');
    const maxBytes = 250 * 1024; // 250KB
    let bytesRead = 0;

    for await (const chunk of response.body) {
      bytesRead += chunk.length;
      buffer += decoder.decode(chunk, { stream: true });
      if (buffer.includes('</head>') || bytesRead >= maxBytes) {
        break;
      }
    }

    controller.abort(); // Cancel remaining download

    const html = buffer;

    const ogTitleMatch = html.match(/<meta\s+property=["']og:title["']\s+content=["']([^"']+)["']/i) ||
                        html.match(/<meta\s+content=["']([^"']+)["']\s+property=["']og:title["']/i);
    const ogImageMatch = html.match(/<meta\s+property=["']og:image["']\s+content=["']([^"']+)["']/i) ||
                        html.match(/<meta\s+content=["']([^"']+)["']\s+property=["']og:image["']/i);
    const ogDescMatch = html.match(/<meta\s+property=["']og:description["']\s+content=["']([^"']+)["']/i) ||
                       html.match(/<meta\s+content=["']([^"']+)["']\s+property=["']og:description["']/i);

    const title = ogTitleMatch ? ogTitleMatch[1] : `${platform.charAt(0).toUpperCase() + platform.slice(1)} Video`;
    const thumbnail = ogImageMatch ? ogImageMatch[1] : '';
    const description = ogDescMatch ? ogDescMatch[1] : '';

    const durationSec = parseDurationFromHtml(html);

    return {
      title: title.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"'),
      thumbnail,
      description: description.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"'),
      duration: durationSec > 0 ? formatDuration(durationSec) : 'Unknown',
      duration_raw: durationSec,
      platform,
      maxHeight: 720,
      originalUrl: url,
      tags: []
    };
  } catch (err) {
    if (err.name !== 'AbortError') {
      console.warn(`Open Graph metadata scraping failed for ${url}:`, err.message);
    }
    throw err;
  }
}

// Public Invidious instances to fetch unblocked YouTube metadata and streams
// Public Invidious instances fallback list (used if dynamic fetch fails)
const FALLBACK_INVIDIOUS_INSTANCES = [
  'https://invidious.nerdvpn.de',
  'https://invidious.flokinet.to',
  'https://invidious.io.lol',
  'https://yewtu.be',
  'https://invidious.no-logs.com',
  'https://inv.tux.im'
];

async function fetchInvidiousVideoInfo(videoId) {
  let instances = [];
  try {
    console.log('Fetching active Invidious instances dynamically from api.invidious.io...');
    const response = await fetch('https://api.invidious.io/instances.json?sort_by=type,health', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
      }
    });
    if (response.ok) {
      const data = await response.json();
      instances = data
        .filter(item => {
          const info = item[1];
          return info && info.type === 'https' && info.api === true && (info.health === undefined || parseFloat(info.health) > 90);
        })
        .map(item => item[1].uri || `https://${item[0]}`);
      console.log(`Successfully retrieved ${instances.length} healthy Invidious instances.`);
    }
  } catch (err) {
    console.warn('Failed to fetch dynamic Invidious instances, using fallback list:', err.message);
  }

  if (!instances || instances.length === 0) {
    instances = FALLBACK_INVIDIOUS_INSTANCES;
  }

  // Limit to top 8 healthiest instances to prevent long timeouts
  const targetInstances = instances.slice(0, 8);

  for (const instance of targetInstances) {
    try {
      console.log(`Trying Invidious instance: ${instance} for video: ${videoId}`);
      // Request with local=true to get proxied stream links, adding User-Agent to bypass Cloudflare
      const response = await fetch(`${instance}/api/v1/videos/${videoId}?local=true`, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
          'Accept': 'application/json'
        }
      });
      if (response.ok) {
        const data = await response.json();
        if (data && (data.formatStreams || data.adaptiveFormats)) {
          // Success! Inject the instance host to make sure absolute URLs are completed if they are relative
          const streams = data.formatStreams || [];
          streams.forEach(s => {
            if (s.url && s.url.startsWith('/')) {
              s.url = `${instance}${s.url}`;
            }
          });
          const adaptive = data.adaptiveFormats || [];
          adaptive.forEach(a => {
            if (a.url && a.url.startsWith('/')) {
              a.url = `${instance}${a.url}`;
            }
          });
          return data;
        }
      }
    } catch (err) {
      console.warn(`Invidious instance ${instance} failed:`, err.message);
    }
  }
  throw new Error('All public Invidious instances failed to resolve video info. Please try again in a few moments.');
}

function getInvidiousFormat(invidiousData, quality) {
  if (quality === 'audio') {
    const adaptive = invidiousData.adaptiveFormats || [];
    const audioFormat = adaptive.find(f => f.type && f.type.startsWith('audio/'));
    if (audioFormat) {
      return {
        url: audioFormat.url,
        size: parseInt(audioFormat.size) || 0
      };
    }
  } else {
    const streams = invidiousData.formatStreams || [];
    if (streams.length > 0) {
      let matched = streams.find(s => s.qualityLabel === quality || s.quality === quality);
      if (!matched && quality === '360p') {
        matched = streams.find(s => s.quality === 'medium');
      }
      if (!matched && quality === '720p') {
        matched = streams.find(s => s.quality === 'hd720');
      }
      const selected = matched || streams[0];
      return {
        url: selected.url,
        size: parseInt(selected.size) || 0
      };
    }
  }
  return null;
}

// Helper: Clean up error messages and handle Vercel libcrypt/python dependency issues
function getCleanError(stderrData, defaultMsg) {
  const hasDependencyError = stderrData && (
    stderrData.includes('libcrypt.so.1') || 
    stderrData.includes('python3') || 
    stderrData.includes('python') || 
    stderrData.includes('No such file or directory')
  );
  if (hasDependencyError) {
    return 'Running yt-dlp failed due to missing system library or runtime (python3 / libcrypt.so.1) on Vercel. For full compatibility, please deploy to a persistent host like Railway, Render, or a VPS.';
  }
  let cleanError = defaultMsg;
  if (stderrData) {
    const lines = stderrData.split('\n').map(l => l.trim()).filter(Boolean);
    const errorLine = lines.find(line => line.toLowerCase().includes('error'));
    if (errorLine) {
      cleanError = errorLine;
    } else if (lines.length > 0) {
      cleanError = lines[lines.length - 1];
    }
  }
  return cleanError;
}

// Parse ISO 8601 duration format (PT#H#M#S) into seconds
function parseISO8601Duration(durationStr) {
  const matches = durationStr.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!matches) return 0;
  const hours = parseInt(matches[1], 10) || 0;
  const minutes = parseInt(matches[2], 10) || 0;
  const seconds = parseInt(matches[3], 10) || 0;
  return hours * 3600 + minutes * 60 + seconds;
}

// Helper: Scrape all metadata (duration, description, tags) from YouTube HTML watch page
async function scrapeYouTubePageMetadata(url) {
  try {
    const controller = new AbortController();
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
      },
      signal: controller.signal
    });
    if (!response.ok) return null;

    let buffer = '';
    const decoder = new TextDecoder('utf-8');
    const maxBytes = 350 * 1024; // 350KB
    let bytesRead = 0;
    let foundMetadata = null;

    for await (const chunk of response.body) {
      bytesRead += chunk.length;
      buffer += decoder.decode(chunk, { stream: true });

      // Check if we have the ytInitialPlayerResponse
      const playerResponseMatch = buffer.match(/ytInitialPlayerResponse\s*=\s*({.+?});/) || 
                                   buffer.match(/var\s+ytInitialPlayerResponse\s*=\s*({.+?});/);
      if (playerResponseMatch && playerResponseMatch[1]) {
        try {
          const playerResponse = JSON.parse(playerResponseMatch[1]);
          const lengthSeconds = playerResponse.videoDetails?.lengthSeconds;
          const description = playerResponse.videoDetails?.shortDescription || '';
          const thumbnails = playerResponse.videoDetails?.thumbnail?.thumbnails || [];
          const thumbnail = thumbnails.length > 0 ? thumbnails[thumbnails.length - 1].url : '';
          const title = playerResponse.videoDetails?.title || '';
          
          if (lengthSeconds) {
            foundMetadata = {
              durationSec: parseInt(lengthSeconds, 10) || 0,
              description: description.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"'),
              thumbnail,
              title,
              tags: playerResponse.videoDetails?.keywords || []
            };
            break; // Break out of stream read loop
          }
        } catch (e) {
          // JSON parsing failed (incomplete chunk), keep reading
        }
      }

      // If we see </head>, check if we have duration
      if (buffer.includes('</head>')) {
        const durationSec = parseDurationFromHtml(buffer);
        if (durationSec > 0) {
          const descMatch = buffer.match(/<meta\s+name=["']description["']\s+content=["']([^"']+)["']/i) ||
                            buffer.match(/<meta\s+property=["']og:description["']\s+content=["']([^"']+)["']/i);
          const description = descMatch ? descMatch[1] : '';
          
          const keywordsMatch = buffer.match(/<meta\s+name=["']keywords["']\s+content=["']([^"']+)["']/i);
          let tags = [];
          if (keywordsMatch && keywordsMatch[1]) {
            tags = keywordsMatch[1].split(',').map(t => t.trim()).filter(Boolean);
          }

          foundMetadata = {
            durationSec,
            description: description.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"'),
            tags
          };
          break;
        }
      }

      if (bytesRead >= maxBytes) {
        break;
      }
    }

    controller.abort(); // Cancel the remaining download
    return foundMetadata;
  } catch (err) {
    if (err.name !== 'AbortError') {
      console.warn('Failed to scrape YouTube page metadata:', err.message);
    }
    return null;
  }
}

// Helper: Fetch YouTube metadata using oEmbed (bypasses blocks/rate-limits on Vercel)
async function getYouTubeOEmbed(url, force = false) {
  const oEmbedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`;
  
  const [oEmbedRes, pageMeta] = await Promise.all([
    fetch(oEmbedUrl).then(r => r.ok ? r.json() : null).catch(() => null),
    scrapeYouTubePageMetadata(url).catch(() => null)
  ]);
  
  if (!oEmbedRes) {
    throw new Error(`oEmbed failed to fetch`);
  }
  
  const durationSec = pageMeta ? pageMeta.durationSec : 0;
  if (!force && (!durationSec || durationSec === 0)) {
    throw new Error(`oEmbed watch page scrape returned 0 or missing duration`);
  }

  const description = (pageMeta && pageMeta.description) || `Uploaded by ${oEmbedRes.author_name || 'unknown'}.`;
  const tags = (pageMeta && pageMeta.tags) || [];
  
  return {
    title: (pageMeta && pageMeta.title) || oEmbedRes.title || 'YouTube Video',
    duration: durationSec > 0 ? formatDuration(durationSec) : 'Unknown',
    duration_raw: durationSec,
    thumbnail: (pageMeta && pageMeta.thumbnail) || oEmbedRes.thumbnail_url || '',
    platform: 'youtube',
    maxHeight: 1080,
    originalUrl: url,
    description,
    tags
  };
}

// GET /api/cobalt-instances - Get list of active community Cobalt instances
app.get('/api/cobalt-instances', async (req, res) => {
  try {
    const instances = await getCobaltInstances();
    res.json({ instances });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/info - Get video details
app.get('/api/info', async (req, res) => {
  const { url } = req.query;

  if (!url) {
    return res.status(400).json({ error: 'URL parameter is required' });
  }

  const cleanUrl = url.trim();
  if (infoCache.has(cleanUrl)) {
    console.log(`Serving cached info for: ${cleanUrl}`);
    return res.json(infoCache.get(cleanUrl));
  }

  // Intercept res.json to automatically cache successful metadata retrievals
  const originalJson = res.json.bind(res);
  res.json = (body) => {
    if (res.statusCode === 200 && body && !body.error && body.title) {
      infoCache.set(cleanUrl, body);
    }
    return originalJson(body);
  };

  if (!isAllowedPlatform(cleanUrl)) {
    return res.status(403).json({ error: 'Any Downloader only supports downloads from YouTube, TikTok, Pinterest, and Instagram.' });
  }

  console.log(`Fetching info for URL: ${cleanUrl}`);

  const isYouTube = url.includes('youtube.com') || url.includes('youtu.be');
  if (isYouTube) {
    try {
      console.log(`Trying fast YouTube oEmbed + HTML metadata extraction first for: ${url}`);
      const info = await getYouTubeOEmbed(url);
      return res.json(info);
    } catch (fastErr) {
      console.warn(`Fast YouTube oEmbed failed, falling back to heavy extractors:`, fastErr.message);
      try {
        console.log(`Using youtubei.js to fetch YouTube info for: ${url}`);
        const videoId = getYouTubeID(url);
        if (!videoId) {
          throw new Error('Could not parse YouTube video ID.');
        }
        const yt = await getYoutubeClient();
        
        let videoInfo = null;
        let lastErr = null;
        const clientsToTry = ['ANDROID', 'TV', 'MWEB', 'WEB'];
        
        for (const clientName of clientsToTry) {
          try {
            console.log(`Trying youtubei.js client: ${clientName}`);
            const tempInfo = await yt.getInfo(videoId, { client: clientName });
            if (tempInfo && tempInfo.streaming_data && tempInfo.basic_info && tempInfo.basic_info.title) {
              videoInfo = tempInfo;
              console.log(`Successfully fetched videoInfo using client: ${clientName}`);
              break;
            }
          } catch (e) {
            console.warn(`youtubei.js client ${clientName} failed:`, e.message);
            lastErr = e;
          }
        }
        
        if (!videoInfo || !videoInfo.basic_info || !videoInfo.basic_info.title || videoInfo.basic_info.title.toLowerCase() === 'youtube video' || !videoInfo.basic_info.duration) {
          throw new Error('youtubei.js returned empty or blocked metadata.');
        }
        
        const formats = videoInfo.streaming_data?.formats || [];
        const adaptive = videoInfo.streaming_data?.adaptive_formats || [];
        const allFormats = [...formats, ...adaptive];
        const heights = allFormats.map(f => f.height || 0);
        const maxHeight = Math.max(...heights, 0);

        // Find best thumbnail
        const thumbnails = videoInfo.basic_info.thumbnail || [];
        const bestThumbnail = thumbnails.length > 0 ? thumbnails[thumbnails.length - 1].url : '';
        
        // Fallback title extraction
        let titleVal = videoInfo.basic_info.title;
        if (!titleVal && videoInfo.page && videoInfo.page[0]) {
          try {
            titleVal = videoInfo.page[0].videoDetails?.title;
          } catch (e) {}
        }
        if (!titleVal) titleVal = 'YouTube Video';

        const info = {
          title: titleVal,
          duration: formatDuration(videoInfo.basic_info.duration || 0),
          duration_raw: videoInfo.basic_info.duration || 0,
          thumbnail: bestThumbnail,
          platform: 'youtube',
          maxHeight,
          originalUrl: url,
          description: videoInfo.basic_info.short_description || '',
          tags: videoInfo.basic_info.keywords || []
        };

        return res.json(info);
      } catch (ytErr) {
        console.warn(`youtubei.js failed to fetch info, trying @distube/ytdl-core fallback:`, ytErr.message);
        try {
          const data = await ytdl.getInfo(url);
          if (!data || !data.videoDetails || !data.videoDetails.title || data.videoDetails.title.toLowerCase() === 'youtube video' || !data.videoDetails.lengthSeconds || parseInt(data.videoDetails.lengthSeconds) === 0) {
            throw new Error('ytdl-core returned empty or blocked metadata.');
          }

          const formats = data.formats || [];
          const heights = formats.map(f => f.height || 0);
          const maxHeight = Math.max(...heights, 0);

          const thumbnails = data.videoDetails.thumbnails || [];
          const bestThumbnail = thumbnails.length > 0 ? thumbnails[thumbnails.length - 1].url : '';

          const info = {
            title: data.videoDetails.title || 'YouTube Video',
            duration: formatDuration(parseInt(data.videoDetails.lengthSeconds) || 0),
            duration_raw: parseInt(data.videoDetails.lengthSeconds) || 0,
            thumbnail: bestThumbnail,
            platform: 'youtube',
            maxHeight,
            originalUrl: url,
            description: data.videoDetails.description || '',
            tags: data.videoDetails.keywords || []
          };

          return res.json(info);
        } catch (ytdlErr) {
          console.warn(`@distube/ytdl-core failed, trying Invidious fallback first for duration metadata:`, ytdlErr.message);
          try {
            const videoId = getYouTubeID(url);
            const invidiousData = await fetchInvidiousVideoInfo(videoId);
            
            if (!invidiousData || !invidiousData.title || invidiousData.title.toLowerCase() === 'youtube video' || !invidiousData.lengthSeconds || parseInt(invidiousData.lengthSeconds) === 0) {
              throw new Error('Invidious returned empty or blocked metadata.');
            }

            const info = {
              title: invidiousData.title || 'YouTube Video',
              duration: formatDuration(invidiousData.lengthSeconds || 0),
              duration_raw: invidiousData.lengthSeconds || 0,
              thumbnail: invidiousData.videoThumbnails && invidiousData.videoThumbnails.length > 0 ? invidiousData.videoThumbnails[invidiousData.videoThumbnails.length - 1].url : '',
              platform: 'youtube',
              maxHeight: 720,
              originalUrl: url,
              description: invidiousData.description || '',
              tags: invidiousData.keywords || []
            };
            return res.json(info);
          } catch (invErr) {
            console.warn(`Invidious metadata fetch failed, falling back to YouTube oEmbed:`, invErr.message);
            try {
              const info = await getYouTubeOEmbed(url, true);
              return res.json(info);
            } catch (oEmbedErr) {
              console.warn(`YouTube oEmbed failed, falling back to Open Graph scraping:`, oEmbedErr.message);
              try {
                const info = await scrapeOpenGraphMetadata(url, 'youtube');
                return res.json(info);
              } catch (ogErr) {
                console.warn(`All metadata scrapers failed, using generic fallback:`, ogErr.message);
                const videoId = getYouTubeID(url) || '';
                const thumbnail = videoId ? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg` : '';
                return res.json({
                  title: 'YouTube Video',
                  duration: 'Unknown',
                  duration_raw: 0,
                  thumbnail,
                  platform: 'youtube',
                  maxHeight: 720,
                  originalUrl: url,
                  description: 'Uploaded on YouTube. (Generic fallback)',
                  tags: []
                });
              }
            }
          }
        }
      }
    }
  }

  const platformName = url.includes('tiktok.com') ? 'tiktok' :
                       (url.includes('pinterest.com') || url.includes('pin.it') ? 'pinterest' : 'instagram');

  if (isVercel) {
    try {
      console.log(`Vercel environment: Scraping metadata for ${platformName} from ${url}`);
      const info = await scrapeOpenGraphMetadata(url, platformName);
      if (info && info.duration_raw > 0) {
        return res.json(info);
      }
      throw new Error('Scraped duration is 0 or missing');
    } catch (err) {
      console.warn(`Failed to scrape Open Graph with duration for ${platformName}, trying oEmbed/generic fallbacks:`, err.message);
      if (platformName === 'tiktok') {
        try {
          const oEmbedUrl = `https://www.tiktok.com/oembed?url=${encodeURIComponent(url)}`;
          const response = await fetch(oEmbedUrl);
          if (response.ok) {
            const data = await response.json();
            return res.json({
              title: data.title || 'TikTok Video',
              duration: 'Unknown',
              duration_raw: 0,
              thumbnail: data.thumbnail_url || '',
              platform: 'tiktok',
              maxHeight: 720,
              originalUrl: url,
              description: `Uploaded by ${data.author_name || 'unknown'}.`,
              tags: []
            });
          }
        } catch (tokErr) {
          console.warn('TikTok oEmbed fallback failed:', tokErr.message);
        }
      }

      // Generic fallback
      return res.json({
        title: `${platformName.charAt(0).toUpperCase() + platformName.slice(1)} Video`,
        duration: 'Unknown',
        duration_raw: 0,
        thumbnail: '',
        platform: platformName,
        maxHeight: 720,
        originalUrl: url,
        description: `Video on ${platformName}.`,
        tags: []
      });
    }
  }

  // Speed-optimized arguments: skip update check, skip SSL check, skip format verify, 5s timeout
  const args = [
    '-J', 
    '--no-playlist', 
    '--no-warnings', 
    '--no-call-home',
    '--no-check-certificates',
    '--no-check-formats',
    '--skip-download',
    '--socket-timeout', '5',
    '--no-cache-dir',
    url
  ];
  
  const proc = spawn(YTDLP_PATH, args);

  let stdoutData = '';
  let stderrData = '';
  let hasResponded = false;

  proc.on('error', (err) => {
    console.error(`Failed to spawn yt-dlp:`, err);
    if (!hasResponded) {
      hasResponded = true;
      let errorMsg = 'Failed to execute video downloader.';
      if (isVercel) {
        errorMsg = 'Downloads are not supported in Vercel serverless functions (requires persistent server like Render, Railway, or a VPS).';
      }
      res.status(500).json({ error: errorMsg });
    }
  });

  proc.stdout.on('data', (data) => {
    stdoutData += data.toString();
  });

  proc.stderr.on('data', (data) => {
    stderrData += data.toString();
  });

  proc.on('close', (code) => {
    if (hasResponded) return;
    hasResponded = true;

    if (code !== 0) {
      console.error(`yt-dlp info failed with code ${code}. Error: ${stderrData}`);
      console.log(`yt-dlp failed locally, falling back to Open Graph scraper for ${platformName}`);
      scrapeOpenGraphMetadata(url, platformName)
        .then(info => res.json(info))
        .catch(() => {
          const cleanError = getCleanError(stderrData, 'Failed to fetch video details. Verify the link and try again.');
          res.status(500).json({ error: cleanError });
        });
      return;
    }

    try {
      const data = JSON.parse(stdoutData);
      
      // Extract available formats and maximum height
      const formats = data.formats || [];
      const heights = formats.map(f => f.height || 0);
      const maxHeight = Math.max(...heights, 0);

      // Clean up metadata (include tags & description for analyzer)
      const info = {
        id: data.id,
        title: data.title,
        description: data.description || 'No description available for this video.',
        tags: data.tags || data.categories || [],
        duration: formatDuration(data.duration),
        duration_raw: data.duration,
        thumbnail: data.thumbnail || (data.thumbnails && data.thumbnails.length > 0 ? data.thumbnails[data.thumbnails.length - 1].url : ''),
        platform: data.extractor_key ? data.extractor_key.toLowerCase() : 'video',
        maxHeight,
        originalUrl: url
      };

      res.json(info);
    } catch (err) {
      console.error('Error parsing yt-dlp output:', err);
      res.status(500).json({ error: 'Error processing video details.' });
    }
  });
});

// GET /api/chunk - Stream a specific byte range of a video (or entire file if range omitted)
app.get('/api/chunk', async (req, res) => {
  const { url, start, end } = req.query;
  if (!url) {
    return res.status(400).json({ error: 'URL parameter is required' });
  }

  try {
    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
    };
    if (start !== undefined && end !== undefined) {
      headers['Range'] = `bytes=${start}-${end}`;
    }

    const response = await fetch(url, { headers });
    
    // Check if the request failed and it's not a successful partial content status
    if (!response.ok && response.status !== 206) {
      // If we got a 416 Range Not Satisfiable, return it directly so the client can stop the download loop
      if (response.status === 416) {
        return res.status(416).json({ error: 'Range Not Satisfiable' });
      }
      throw new Error(`Failed to fetch stream: ${response.statusText} (${response.status})`);
    }

    let responseStatus = response.status;
    let contentLength = parseInt(response.headers.get('content-length'), 10) || 0;
    
    let rangeStart = start !== undefined ? parseInt(start, 10) : null;
    let rangeEnd = end !== undefined ? parseInt(end, 10) : null;
    
    let shouldSlice = false;
    let sliceBytesNeed = 0;
    
    if (rangeStart !== null && rangeEnd !== null && responseStatus === 200) {
      // Upstream ignored the Range header. We must manually slice the stream.
      shouldSlice = true;
      sliceBytesNeed = rangeEnd - rangeStart + 1;
      responseStatus = 206;
      res.setHeader('Content-Range', `bytes ${rangeStart}-${rangeEnd}/${contentLength || '*'}`);
      res.setHeader('Content-Length', sliceBytesNeed);
      res.status(206);
    } else {
      res.status(responseStatus);
      res.setHeader('Content-Type', response.headers.get('content-type') || 'application/octet-stream');
      res.setHeader('Content-Length', response.headers.get('content-length') || '');
      if (response.headers.has('content-range')) {
        res.setHeader('Content-Range', response.headers.get('content-range') || '');
      }
    }

    const body = response.body;
    if (body) {
      let skippedBytes = 0;
      let sentBytes = 0;

      console.log(`[ChunkProxy] Processing body. Slicing: ${shouldSlice}, has getReader: ${typeof body.getReader === 'function'}, has pipe: ${typeof body.pipe === 'function'}`);

      if (typeof body.getReader === 'function') {
        const reader = body.getReader();
        try {
          let chunksCount = 0;
          let bytesCount = 0;
          while (true) {
            const { done, value } = await reader.read();
            if (done) {
              console.log(`[ChunkProxy] Reader done. Total chunks: ${chunksCount}, Total bytes: ${bytesCount}`);
              break;
            }

            chunksCount++;
            bytesCount += value.length;
            let chunk = value;
            if (shouldSlice) {
              if (skippedBytes < rangeStart) {
                if (skippedBytes + chunk.length <= rangeStart) {
                  skippedBytes += chunk.length;
                  continue;
                } else {
                  const offset = rangeStart - skippedBytes;
                  chunk = chunk.slice(offset);
                  skippedBytes = rangeStart;
                }
              }

              if (sentBytes + chunk.length > sliceBytesNeed) {
                const take = sliceBytesNeed - sentBytes;
                res.write(chunk.slice(0, take));
                sentBytes += take;
                console.log(`[ChunkProxy] Slice complete. Sent required bytes: ${sentBytes}`);
                await reader.cancel().catch(() => {}); // Stop upstream stream safely
                break;
              } else {
                res.write(chunk);
                sentBytes += chunk.length;
              }
            } else {
              res.write(chunk);
            }
          }
          res.end();
          console.log(`[ChunkProxy] Finished streaming chunk range. Response ended.`);
        } catch (streamErr) {
          console.error('[ChunkProxy] Chunk reader stream error:', streamErr.message);
          if (!res.headersSent) {
            res.status(500).json({ error: 'Failed to read chunk stream.' });
          }
        }
      } else if (typeof body.pipe === 'function') {
        // Fallback for Node Readable stream
        if (shouldSlice) {
          body.on('data', (chunk) => {
            let dataChunk = chunk;
            if (skippedBytes < rangeStart) {
              if (skippedBytes + dataChunk.length <= rangeStart) {
                skippedBytes += dataChunk.length;
                return;
              } else {
                const offset = rangeStart - skippedBytes;
                dataChunk = dataChunk.slice(offset);
                skippedBytes = rangeStart;
              }
            }

            if (sentBytes + dataChunk.length > sliceBytesNeed) {
              const take = sliceBytesNeed - sentBytes;
              res.write(dataChunk.slice(0, take));
              sentBytes += take;
              if (typeof body.destroy === 'function') body.destroy();
              res.end();
            } else {
              res.write(dataChunk);
              sentBytes += dataChunk.length;
            }
          });
          body.on('end', () => {
            if (!res.writableEnded) res.end();
          });
          body.on('error', (err) => {
            console.error('Node chunk stream error:', err.message);
            if (!res.headersSent) {
              res.status(500).json({ error: 'Failed to read node stream.' });
            }
          });
        } else {
          body.pipe(res);
        }
      } else {
        const { Readable } = await import('stream');
        const stream = Readable.fromWeb(body);
        stream.on('error', (err) => {
          console.error('Fallback chunk stream read error:', err.message);
          if (!res.headersSent) {
            res.status(500).json({ error: 'Failed to read fallback stream.' });
          }
        });
        stream.pipe(res);
      }
    } else {
      res.status(500).json({ error: 'No response body' });
    }
  } catch (err) {
    console.error('Error fetching chunk:', err);
    if (!res.headersSent) {
      res.status(500).json({ error: err.message });
    }
  }
});

// GET /api/size - Get content length of a URL
app.get('/api/size', async (req, res) => {
  const { url } = req.query;
  if (!url) {
    return res.status(400).json({ error: 'URL parameter is required' });
  }
  try {
    const size = await getContentLength(url);
    res.json({ size });
  } catch (err) {
    console.error('Error fetching size:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/proxy-image - Proxy an image to bypass CORS and hotlinking blocks
app.get('/api/proxy-image', async (req, res) => {
  const { url } = req.query;
  if (!url) {
    return res.status(400).json({ error: 'URL parameter is required' });
  }

  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5'
      },
      signal: AbortSignal.timeout(5000)
    });

    if (!response.ok) {
      throw new Error(`Upstream returned status ${response.status}`);
    }

    res.setHeader('Content-Type', response.headers.get('content-type') || 'image/jpeg');
    res.setHeader('Cache-Control', 'public, max-age=86400'); // Cache for 24h

    const body = response.body;
    if (body) {
      const { Readable } = await import('stream');
      const stream = Readable.fromWeb(body);
      stream.on('error', (err) => {
        console.error('Proxy image stream read error:', err.message);
        if (!res.headersSent) {
          res.status(500).json({ error: 'Failed to read image stream.' });
        }
      });
      stream.pipe(res);
    } else {
      res.status(500).json({ error: 'No response body' });
    }
  } catch (err) {
    console.error('Error proxying image:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/download - Start a download job
app.post('/api/download', async (req, res) => {
  const { url, quality, title } = req.body;

  if (!url || !quality || !title) {
    return res.status(400).json({ error: 'URL, quality, and title are required' });
  }

  if (!isAllowedPlatform(url)) {
    return res.status(403).json({ error: 'Any Downloader only supports downloads from YouTube, TikTok, Pinterest, and Instagram.' });
  }

  const jobId = crypto.randomUUID();
  console.log(`Starting download job ${jobId} for quality ${quality}`);

  // Vercel platform safeguards (limitations on response size and runtime dependencies)
  if (isVercel) {
    const isYouTube = url.includes('youtube.com') || url.includes('youtu.be');
    if (isYouTube) {
      try {
        console.log(`Resolving YouTube download on Vercel via Cobalt API...`);
        const cobaltResult = await fetchFromCobalt(url, quality);
        
        const fileExt = quality === 'audio' ? 'mp3' : 'mp4';
        const fileName = `[Any Downloader] - ${title.replace(/[\\/:*?"<>|]/g, '_')}.${fileExt}`;

        return res.json({
          streamUrl: cobaltResult.url,
          fileName
        });
      } catch (cobaltErr) {
        console.warn('Cobalt download failed for YouTube on Vercel, trying Invidious fallback:', cobaltErr.message);
        try {
          const videoId = getYouTubeID(url);
          const invidiousData = await fetchInvidiousVideoInfo(videoId);
          const format = getInvidiousFormat(invidiousData, quality);
          if (!format || !format.url) {
            throw new Error('No compatible YouTube download stream found on Invidious.');
          }

          const fileExt = quality === 'audio' ? 'mp3' : 'mp4';
          const fileName = `[Any Downloader] - ${title.replace(/[\\/:*?"<>|]/g, '_')}.${fileExt}`;

          return res.json({
            streamUrl: format.url,
            totalSize: format.size || 15 * 1024 * 1024,
            fileName
          });
        } catch (invErr) {
          console.error('All methods failed on Vercel for YouTube:', invErr.message);
          return res.status(500).json({ error: `Vercel YouTube download failed: All methods (including Cobalt & Invidious fallbacks) failed.` });
        }
      }
    } else {
      try {
        console.log(`Resolving non-YouTube download for ${url} via Cobalt API...`);
        const cobaltResult = await fetchFromCobalt(url, quality);
        
        const fileExt = quality === 'audio' ? 'mp3' : 'mp4';
        const fileName = `[Any Downloader] - ${title.replace(/[\\/:*?"<>|]/g, '_')}.${fileExt}`;

        return res.json({
          streamUrl: cobaltResult.url,
          fileName
        });
      } catch (cobaltErr) {
        console.error(`Cobalt download failed for non-YouTube video:`, cobaltErr.message);
        return res.status(500).json({ 
          error: `Vercel download failed: ${cobaltErr.message}. For full compatibility, please deploy this repository to Render.com.` 
        });
      }
    }
  }

  // Map requested quality to yt-dlp format options
  let formatArg = 'b'; // best combined format by default
  let isAudio = false;

  if (quality === 'audio') {
    isAudio = true;
    formatArg = 'ba';
  } else {
    // Quality choices: 4k (2160), 2k (1440), 1080p, 720p, 480p, 360p
    const resHeight = quality.replace('p', '');
    if (!isNaN(resHeight)) {
      const height = parseInt(resHeight, 10);
      // COMPATIBILITY FIX: Force h264 video codec (avc1) + m4a audio codec to ensure playability on standard systems
      // Without this, yt-dlp might download AV1/VP9 codecs in MP4 containers which Windows can't play natively
      formatArg = `bv*[height<=${height}][vcodec^=avc1]+ba[ext=m4a]/bv*[height<=${height}][ext=mp4]+ba[ext=m4a]/bv*[height<=${height}]+ba/b[height<=${height}]`;
    }
  }

  // Create temporary filename format
  // Use jobId in filename to prevent collisions
  const fileExt = isAudio ? 'mp3' : 'mp4';
  const outTemplate = path.join(DOWNLOADS_DIR, `${jobId}.%(ext)s`);

  // yt-dlp arguments with speed optimizations (concurrent fragments & larger buffer sizes)
  const args = [
    '--no-playlist',
    '--ffmpeg-location', FFMPEG_DIR,
    '-f', formatArg,
    '-o', outTemplate,
    '--concurrent-fragments', '5',
    '--buffer-size', '1024K',
    '--http-chunk-size', '10M',
    '--no-part'
  ];

  if (isAudio) {
    args.push('-x', '--audio-format', 'mp3', '--audio-quality', '0');
  } else {
    args.push('--merge-output-format', 'mp4');
  }

  args.push(url);

  console.log(`Running yt-dlp with args: ${args.join(' ')}`);
  const proc = spawn(YTDLP_PATH, args);

  proc.on('error', (err) => {
    console.error(`Job ${jobId} failed to spawn yt-dlp:`, err);
    let errMsg = 'Failed to execute video downloader.';
    if (isVercel) {
      errMsg = 'Downloads are not supported in Vercel serverless functions (requires persistent server like Render, Railway, or a VPS).';
    }
    updateJob({ status: 'error', error: errMsg });
  });

  const job = {
    id: jobId,
    status: 'downloading',
    progress: 0,
    speed: '0 KiB/s',
    eta: 'Unknown',
    size: 'Unknown',
    filePath: '',
    fileName: `[Any Downloader] - ${title.replace(/[\\/:*?"<>|]/g, '_')}.${fileExt}`,
    error: null,
    clients: [],
    proc: proc // Save reference for cancellation
  };

  jobs.set(jobId, job);

  // Notify clients of updates
  const updateJob = (updates) => {
    Object.assign(job, updates);
    job.clients.forEach(client => {
      client.write(`data: ${JSON.stringify({
        status: job.status,
        progress: job.progress,
        speed: job.speed,
        eta: job.eta,
        size: job.size,
        error: job.error
      })}\n\n`);
    });
  };

  proc.stdout.on('data', (data) => {
    const output = data.toString();
    console.log(`[Job ${jobId} stdout]: ${output.trim()}`);

    // Parse progress output: e.g. [download]  12.5% of ~15.00MiB at 4.20MiB/s ETA 00:02
    // Or [download] 100% of 15.00MiB
    const pctMatch = output.match(/\[download\]\s+(\d+(?:\.\d+)?)%/);
    const sizeMatch = output.match(/of\s+(~?\d+(?:\.\d+)?\s*[a-zA-Z]+)/);
    const speedMatch = output.match(/at\s+([^\s]+)/);
    const etaMatch = output.match(/ETA\s+([^\s]+)/);

    const update = {};
    if (pctMatch) {
      update.progress = parseFloat(pctMatch[1]);
    }
    if (sizeMatch) {
      update.size = sizeMatch[1].replace('~', '');
    }
    if (speedMatch) {
      update.speed = speedMatch[1];
    }
    if (etaMatch) {
      update.eta = etaMatch[1];
    }

    if (Object.keys(update).length > 0) {
      updateJob(update);
    }

    if (output.includes('[Merger]') || output.includes('Merging formats')) {
      updateJob({ status: 'merging', progress: 99 });
    }
  });

  let stderrData = '';
  proc.stderr.on('data', (data) => {
    const chunk = data.toString();
    stderrData += chunk;
    console.warn(`[Job ${jobId} stderr]: ${chunk}`);
  });

  proc.on('close', (code) => {
    // If the process was terminated (e.g., SIGKILL on cancellation), code might be null or non-zero
    if (code !== 0 && job.status !== 'error') {
      console.error(`Job ${jobId} failed or closed with code ${code}. Error: ${stderrData}`);
      const cleanError = getCleanError(stderrData, 'Download failed. The stream quality may not be available or was restricted.');
      updateJob({ status: 'error', error: cleanError });
      return;
    }

    if (job.status === 'error') return; // Cancel handle took care of it

    // Find the downloaded file
    const files = fs.readdirSync(DOWNLOADS_DIR);
    const downloadedFile = files.find(f => f.startsWith(jobId));

    if (downloadedFile) {
      const fullPath = path.join(DOWNLOADS_DIR, downloadedFile);
      const actualExt = path.extname(downloadedFile).substring(1);
      const nameWithoutExt = job.fileName.substring(0, job.fileName.lastIndexOf('.'));
      job.fileName = `${nameWithoutExt}.${actualExt}`;
      job.filePath = fullPath;
      
      updateJob({ status: 'completed', progress: 100 });
      console.log(`Job ${jobId} finished. File saved at ${fullPath}`);
    } else {
      console.error(`Job ${jobId} finished but file could not be found.`);
      updateJob({ status: 'error', error: 'Downloaded file not found on server.' });
    }
  });

  res.json({ jobId });
});

// POST /api/cancel - Cancel active download job
app.post('/api/cancel', (req, res) => {
  const { jobId } = req.body;
  const job = jobs.get(jobId);

  if (!job) {
    return res.status(404).json({ error: 'Download job not found.' });
  }

  console.log(`Cancellation request received for job ${jobId}`);

  // Kill download process if running
  if (job.proc) {
    try {
      job.proc.kill('SIGKILL');
      console.log(`Process killed for job ${jobId}`);
    } catch (e) {
      console.error(`Error killing process for job ${jobId}:`, e);
    }
  }

  // Update status
  job.status = 'error';
  job.error = 'Download cancelled by user.';

  // Notify SSE listeners
  job.clients.forEach(client => {
    try {
      client.write(`data: ${JSON.stringify({ status: 'error', error: 'Download cancelled.' })}\n\n`);
      client.end();
    } catch (e) {}
  });

  // Clean up partial files
  setTimeout(() => {
    try {
      const files = fs.readdirSync(DOWNLOADS_DIR);
      const tempFiles = files.filter(f => f.startsWith(jobId));
      tempFiles.forEach(file => {
        const filePath = path.join(DOWNLOADS_DIR, file);
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
          console.log(`Cleaned up partial file: ${filePath}`);
        }
      });
      jobs.delete(jobId);
    } catch (e) {
      console.error('Error cleaning up cancelled files:', e);
    }
  }, 1000);

  res.json({ success: true });
});

// GET /api/progress/:jobId - SSE endpoint for progress tracking
app.get('/api/progress/:jobId', (req, res) => {
  const { jobId } = req.params;
  const job = jobs.get(jobId);

  if (!job) {
    return res.status(404).json({ error: 'Job not found' });
  }

  // Set headers for Server-Sent Events (SSE)
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  // Register client
  job.clients.push(res);

  // Send initial state
  res.write(`data: ${JSON.stringify({
    status: job.status,
    progress: job.progress,
    speed: job.speed,
    eta: job.eta,
    size: job.size,
    error: job.error
  })}\n\n`);

  // Remove client on connection close
  req.on('close', () => {
    job.clients = job.clients.filter(client => client !== res);
  });
});

// GET /api/file/:jobId - Stream downloaded file and clean it up
app.get('/api/file/:jobId', (req, res) => {
  const { jobId } = req.params;
  const job = jobs.get(jobId);

  if (!job || job.status !== 'completed') {
    return res.status(404).json({ error: 'Job not found or not completed' });
  }

  if (job.isStreaming) {
    console.log(`Streaming video directly using ytdl-core for job ${jobId}: ${job.fileName}`);
    
    let ytdlQuality = 'highest';
    if (job.quality === '360p' || job.quality === '480p') {
      ytdlQuality = '18'; // format 18 is 360p MP4 with audio
    } else if (job.quality === 'audio') {
      ytdlQuality = 'highestaudio';
      res.setHeader('Content-Type', 'audio/mpeg');
      res.setHeader('Content-Disposition', `attachment; filename="${job.fileName.replace(/"/g, '\\"')}"; filename*=UTF-8''${encodeURIComponent(job.fileName)}`);
    } else {
      res.setHeader('Content-Type', 'video/mp4');
      res.setHeader('Content-Disposition', `attachment; filename="${job.fileName.replace(/"/g, '\\"')}"; filename*=UTF-8''${encodeURIComponent(job.fileName)}`);
    }

    try {
      // Simulate real browser headers in ytdl to avoid 403 Forbidden rate limits/blocks on Vercel
      const videoId = ytdl.getVideoID(job.originalUrl);
      const stream = ytdl(job.originalUrl, { 
        quality: ytdlQuality,
        filter: job.quality === 'audio' ? 'audioonly' : 'videoandaudio',
        requestOptions: {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
            'Accept': '*/*',
            'Accept-Language': 'en-US,en;q=0.9',
            'Origin': 'https://www.youtube.com',
            'Referer': `https://www.youtube.com/watch?v=${videoId}`
          }
        }
      });
      stream.pipe(res);
      stream.on('end', () => {
        jobs.delete(jobId);
        console.log(`Cleaned up streaming job ${jobId}`);
      });
      stream.on('error', (err) => {
        console.error('ytdl-core stream error:', err);
        if (!res.headersSent) {
          res.status(500).json({ error: 'Error streaming video from YouTube.' });
        }
      });
      return;
    } catch (e) {
      console.error('Failed to initialize ytdl-core stream:', e);
      return res.status(500).json({ error: 'Failed to stream video.' });
    }
  }

  if (!job.filePath || !fs.existsSync(job.filePath)) {
    return res.status(404).json({ error: 'Downloaded file not found' });
  }

  console.log(`Streaming file for job ${jobId}: ${job.fileName}`);

  // Set headers to trigger file download with customized filename
  res.setHeader('Content-Disposition', `attachment; filename="${job.fileName.replace(/"/g, '\\"')}"; filename*=UTF-8''${encodeURIComponent(job.fileName)}`);
  res.setHeader('Content-Type', 'application/octet-stream');

  const fileStream = fs.createReadStream(job.filePath);
  fileStream.pipe(res);

  fileStream.on('end', () => {
    // Schedule file deletion to free up space
    setTimeout(() => {
      try {
        if (fs.existsSync(job.filePath)) {
          fs.unlinkSync(job.filePath);
          console.log(`Deleted temp file for job ${jobId}: ${job.filePath}`);
        }
        jobs.delete(jobId);
      } catch (err) {
        console.error(`Error deleting temp file ${job.filePath}:`, err);
      }
    }, 1000 * 60 * 5); // Keep file on server for 5 minutes after streaming completes
  });

  fileStream.on('error', (err) => {
    console.error(`Error streaming file for job ${jobId}:`, err);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Error streaming file.' });
    }
  });
});

// Serve frontend static files
const frontendDist = path.join(__dirname, 'dist');
app.use(express.static(frontendDist));

// Catch-all to serve index.html for React Router
app.get('*', (req, res) => {
  res.sendFile(path.join(frontendDist, 'index.html'));
});

if (process.env.NODE_ENV !== 'production' || !process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
  });
}

export default app;

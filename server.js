import express from 'express';
import cors from 'cors';
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import ytdl from '@distube/ytdl-core';

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

app.use(cors());
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

// Helper: Fetch YouTube metadata using oEmbed (bypasses blocks/rate-limits on Vercel)
async function getYouTubeOEmbed(url) {
  const oEmbedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`;
  const response = await fetch(oEmbedUrl);
  if (!response.ok) {
    throw new Error(`oEmbed failed with status ${response.status}`);
  }
  const data = await response.json();
  return {
    title: data.title || 'YouTube Video',
    duration: 'Unknown',
    duration_raw: 0,
    thumbnail: data.thumbnail_url || '',
    platform: 'youtube',
    maxHeight: 1080,
    originalUrl: url,
    description: `Uploaded by ${data.author_name || 'unknown'}. (Metadata retrieved via oEmbed)`,
    tags: []
  };
}

// GET /api/info - Get video details
app.get('/api/info', async (req, res) => {
  const { url } = req.query;

  if (!url) {
    return res.status(400).json({ error: 'URL parameter is required' });
  }

  if (!isAllowedPlatform(url)) {
    return res.status(403).json({ error: 'Any Downloader only supports downloads from YouTube, TikTok, Pinterest, and Instagram.' });
  }

  console.log(`Fetching info for URL: ${url}`);

  const isYouTube = url.includes('youtube.com') || url.includes('youtu.be');
  if (isYouTube) {
    try {
      console.log(`Using @distube/ytdl-core to fetch YouTube info for: ${url}`);
      const data = await ytdl.getInfo(url);
      const formats = data.formats || [];
      const heights = formats.map(f => f.height || 0);
      const maxHeight = Math.max(...heights, 0);

      // Find best thumbnail
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
      console.warn(`@distube/ytdl-core failed, falling back to YouTube oEmbed:`, ytdlErr.message);
      try {
        const info = await getYouTubeOEmbed(url);
        return res.json(info);
      } catch (oEmbedErr) {
        console.warn(`YouTube oEmbed failed, falling back to yt-dlp:`, oEmbedErr.message);
      }
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
      const cleanError = getCleanError(stderrData, 'Failed to fetch video details. Verify the link and try again.');
      return res.status(500).json({ error: cleanError });
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

// POST /api/download - Start a download job
app.post('/api/download', (req, res) => {
  const { url, quality, title } = req.body;

  if (!url || !quality || !title) {
    return res.status(400).json({ error: 'URL, quality, and title are required' });
  }

  if (!isAllowedPlatform(url)) {
    return res.status(403).json({ error: 'Any Downloader only supports downloads from YouTube, TikTok, Pinterest, and Instagram.' });
  }

  const jobId = crypto.randomUUID();
  console.log(`Starting download job ${jobId} for quality ${quality}`);

  // If running on Vercel and it is a YouTube URL, we use direct streaming fallback
  const isYouTube = url.includes('youtube.com') || url.includes('youtu.be');
  if (isVercel && isYouTube) {
    const fileExt = quality === 'audio' ? 'mp3' : 'mp4';
    const job = {
      id: jobId,
      status: 'completed',
      progress: 100,
      speed: '0 KiB/s',
      eta: '0s',
      size: 'Unknown',
      filePath: '', // indicates streaming
      fileName: `[Any Downloader] - ${title.replace(/[\\/:*?"<>|]/g, '_')}.${fileExt}`,
      error: null,
      clients: [],
      isStreaming: true,
      originalUrl: url,
      quality: quality
    };
    jobs.set(jobId, job);
    return res.json({ jobId });
  }

  // Vercel FFmpeg limitation safeguard
  const currentFfmpegPath = path.join(BIN_DIR, process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg');
  if (isVercel && !fs.existsSync(currentFfmpegPath)) {
    const job = {
      id: jobId,
      status: 'error',
      progress: 0,
      speed: '0 KiB/s',
      eta: 'Unknown',
      size: 'Unknown',
      filePath: '',
      fileName: `[Any Downloader] - ${title.replace(/[\\/:*?"<>|]/g, '_')}.mp4`,
      error: 'HD merging requires FFmpeg, which is not available in Vercel serverless functions. Please deploy to Railway, Render, or a VPS to download videos.',
      clients: []
    };
    jobs.set(jobId, job);
    return res.json({ jobId });
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

    // Parse progress output: [download]  12.5% of 15.00MiB at 4.20MiB/s ETA 00:02
    const progressRegex = /\[download\]\s+(\d+\.\d+)%\s+of\s+([^\s]+)\s+at\s+([^\s]+)\s+ETA\s+([^\s]+)/;
    const match = output.match(progressRegex);

    if (match) {
      updateJob({
        progress: parseFloat(match[1]),
        size: match[2],
        speed: match[3],
        eta: match[4]
      });
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
      res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(job.fileName)}"`);
    } else {
      res.setHeader('Content-Type', 'video/mp4');
      res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(job.fileName)}"`);
    }

    try {
      const stream = ytdl(job.originalUrl, { 
        quality: ytdlQuality,
        filter: job.quality === 'audio' ? 'audioonly' : 'videoandaudio'
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
  res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(job.fileName)}"`);
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

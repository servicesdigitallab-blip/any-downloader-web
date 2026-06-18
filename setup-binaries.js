import https from 'https';
import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import { fileURLToPath } from 'url';

const execAsync = promisify(exec);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BIN_DIR = path.join(__dirname, 'bin');
const YTDLP_PATH = path.join(BIN_DIR, 'yt-dlp.exe');
const FFMPEG_PATH = path.join(BIN_DIR, 'ffmpeg.exe');
const FFPROBE_PATH = path.join(BIN_DIR, 'ffprobe.exe');

const YTDLP_URL = 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe';
const FFMPEG_ZIP_URL = 'https://github.com/yt-dlp/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-win64-gpl.zip';

function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    console.log(`Downloading: ${url} -> ${dest}`);
    const file = fs.createWriteStream(dest);
    
    const request = https.get(url, (response) => {
      // Follow redirect
      if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        file.close();
        try {
          fs.unlinkSync(dest);
        } catch (e) {}
        return downloadFile(response.headers.location, dest).then(resolve).catch(reject);
      }

      if (response.statusCode !== 200) {
        file.close();
        try {
          fs.unlinkSync(dest);
        } catch (e) {}
        return reject(new Error(`Failed to download (Status: ${response.statusCode})`));
      }

      response.pipe(file);

      file.on('finish', () => {
        file.close();
        resolve();
      });
    });

    request.on('error', (err) => {
      file.close();
      try {
        fs.unlinkSync(dest);
      } catch (e) {}
      reject(err);
    });
  });
}

async function setup() {
  try {
    if (!fs.existsSync(BIN_DIR)) {
      console.log('Creating bin directory...');
      fs.mkdirSync(BIN_DIR, { recursive: true });
    }

    const hasYtdlp = fs.existsSync(YTDLP_PATH);
    const hasFfmpeg = fs.existsSync(FFMPEG_PATH) && fs.existsSync(FFPROBE_PATH);

    if (hasYtdlp && hasFfmpeg) {
      console.log('✔ All binaries (yt-dlp, ffmpeg, ffprobe) are already installed.');
      process.exit(0);
    }

    if (!hasYtdlp) {
      console.log('Downloading yt-dlp.exe...');
      await downloadFile(YTDLP_URL, YTDLP_PATH);
      console.log('✔ yt-dlp.exe downloaded successfully.');
    } else {
      console.log('✔ yt-dlp.exe is already present.');
    }

    if (!hasFfmpeg) {
      const zipPath = path.join(BIN_DIR, 'ffmpeg.zip');
      const tempExtractDir = path.join(BIN_DIR, 'ffmpeg-temp');

      console.log('Downloading ffmpeg package (zip)...');
      await downloadFile(FFMPEG_ZIP_URL, zipPath);
      console.log('✔ ffmpeg.zip downloaded. Extracting...');

      if (fs.existsSync(tempExtractDir)) {
        fs.rmSync(tempExtractDir, { recursive: true, force: true });
      }
      fs.mkdirSync(tempExtractDir, { recursive: true });

      // Run PowerShell Expand-Archive
      console.log('Running Expand-Archive via PowerShell...');
      const psCommand = `powershell -Command "Expand-Archive -Path '${zipPath}' -DestinationPath '${tempExtractDir}' -Force"`;
      await execAsync(psCommand);
      console.log('✔ ffmpeg.zip extracted.');

      // The zip contains a folder e.g., ffmpeg-master-latest-win64-gpl
      // Find the folder name inside tempExtractDir
      const folders = fs.readdirSync(tempExtractDir);
      const innerFolder = folders.find(f => f.startsWith('ffmpeg'));

      if (!innerFolder) {
        throw new Error('Could not find ffmpeg folder inside extracted contents.');
      }

      const extractedBinDir = path.join(tempExtractDir, innerFolder, 'bin');
      const extractedFfmpeg = path.join(extractedBinDir, 'ffmpeg.exe');
      const extractedFfprobe = path.join(extractedBinDir, 'ffprobe.exe');

      if (fs.existsSync(extractedFfmpeg)) {
        fs.copyFileSync(extractedFfmpeg, FFMPEG_PATH);
        console.log('✔ ffmpeg.exe moved to bin.');
      } else {
        throw new Error('ffmpeg.exe not found in extracted folder.');
      }

      if (fs.existsSync(extractedFfprobe)) {
        fs.copyFileSync(extractedFfprobe, FFPROBE_PATH);
        console.log('✔ ffprobe.exe moved to bin.');
      } else {
        throw new Error('ffprobe.exe not found in extracted folder.');
      }

      // Cleanup
      console.log('Cleaning up temporary files...');
      fs.rmSync(zipPath, { force: true });
      fs.rmSync(tempExtractDir, { recursive: true, force: true });
      console.log('✔ Cleanup complete.');
    } else {
      console.log('✔ ffmpeg and ffprobe are already present.');
    }

    console.log('🎉 Setup completed successfully. All binaries are ready!');
  } catch (error) {
    console.error('❌ Setup failed:', error);
    process.exit(1);
  }
}

setup();

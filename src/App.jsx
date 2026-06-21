import React, { useState, useEffect } from 'react';
import { 
  Download, 
  Link as LinkIcon, 
  Play, 
  Trash2, 
  RefreshCw, 
  CheckCircle, 
  AlertTriangle, 
  Video, 
  Music,
  ExternalLink,
  History,
  X,
  Sparkles,
  Clipboard,
  ChevronDown,
  Info,
  ShieldCheck,
  Zap,
  ArrowRight,
  BookOpen,
  Search,
  Copy,
  Check,
  Slash
} from 'lucide-react';

const API_BASE = import.meta.env.VITE_API_BASE || '';

// Safe fetch helper that parses JSON and provides clean error messages
async function safeFetchJson(url, options = {}) {
  const response = await fetch(url, options);
  const contentType = response.headers.get('content-type');
  let data = null;
  if (contentType && contentType.includes('application/json')) {
    data = await response.json();
  }
  if (!response.ok) {
    const errorMsg = (data && data.error) || `Server returned status ${response.status}`;
    throw new Error(errorMsg);
  }
  return data;
}

// Get total content length of a URL using the server size lookup
async function getUrlTotalSize(streamUrl) {
  try {
    const sizeUrl = `${API_BASE}/api/size?url=${encodeURIComponent(streamUrl)}`;
    const data = await safeFetchJson(sizeUrl);
    if (data && data.size && data.size > 0) {
      return data.size;
    }
  } catch (err) {
    console.warn('Failed to get URL total size via server lookup:', err);
  }
  return 0;
}

// Define quality options
const qualityOptions = [
  { value: '4k', label: '4K Ultra HD', height: 2160, tag: 'MKV/MP4' },
  { value: '2k', label: '2K Quad HD', height: 1440, tag: 'MKV/MP4' },
  { value: '1080p', label: '1080p Full HD', height: 1080, tag: 'MP4' },
  { value: '720p', label: '720p HD', height: 720, tag: 'MP4' },
  { value: '480p', label: '480p SD', height: 480, tag: 'MP4' },
  { value: '360p', label: '360p Low', height: 360, tag: 'MP4' },
  { value: 'audio', label: 'MP3 Audio', height: 0, tag: '320kbps' }
];

// FAQs data
// Blog posts data for SEO
const blogPosts = [
  {
    category: 'YouTube Guide',
    readTime: '3 min read',
    title: 'How to Download YouTube Videos in 1080p and 4K (With Audio)',
    excerpt: 'Learn the technical difference between video streams on YouTube and why many downloaders fail to merge high-definition video with high-fidelity audio streams.',
    content: [
      'When downloading high-definition videos (1080p, 2K, or 4K) from platforms like YouTube, you might notice that standard download tools only offer video without sound. This happens because high-resolution video streams and high-fidelity audio streams are hosted separately by YouTube\'s servers to optimize streaming bandwidth.',
      'To resolve this and provide a playable high-quality MP4 file, our Any Downloader utility performs a double-pass download. It retrieves the best H.264 video stream and the highest quality AAC audio file, then uses a background merger engine (FFmpeg) to combine them into a single, standardized MPEG-4 container. This guarantees full audio-video synchronization and instant playability on all Windows Media Players, iPhones, and Android devices.'
    ]
  },
  {
    category: 'Social Media',
    readTime: '2 min read',
    title: 'The Easiest Way to Save TikTok, Instagram Reels, and Pinterest Videos',
    excerpt: 'Discover how to download videos from social networks like Pinterest, Instagram, and TikTok to your local drive for offline reference, inspiration, and content analysis.',
    content: [
      'Social media platforms like Instagram, TikTok, and Pinterest are filled with short-form educational videos, DIY guides, and creative recipes. However, saving these videos directly for offline reference can be challenging due to platform restrictions and lack of official download buttons.',
      'Any Downloader simplifies this process by acting as a universal hub. By pasting a Pinterest Pin, an Instagram Reel, or a TikTok video URL, the utility bypasses tracker scripts, parses the direct content delivery network (CDN) links, and downloads the file instantly. This enables content creators and designers to archive design inspirations, build mood boards, and review video frames offline without needing constant internet access.'
    ]
  },
  {
    category: 'Security Insights',
    readTime: '2 min read',
    title: 'Understanding Safe Video Downloads: A Legal and Security Perspective',
    excerpt: 'Explore the security precautions you should take when saving media files from the web, and how Any Downloader ensures a malware-free download environment.',
    content: [
      'Many online video converter websites are notorious for popup ads, redirect loops, and malicious script execution. When downloading media files, security should always be your top priority. Using a self-hosted tool or a clean service like Any Downloader protects your computer from browser hijacking and unsolicited downloads.',
      'Our platform runs the entire extraction process on a secure server environment, fetching only the direct media streams from YouTube, TikTok, Pinterest, or Instagram. No intermediate adware or executable scripts are served to your browser. You receive a clean, native MP4 or MP3 file directly from the source CDNs, ensuring absolute safety for your personal files and operating system.'
    ]
  }
];

// Unified helper to download a video/audio stream as a Blob, trying direct fetch and falling back to chunked proxy
async function downloadStreamAsBlob({
  streamUrl,
  totalSize,
  isEstimated,
  selectedQuality,
  setDownloadProgress,
  targetProgressRef,
  setDownloadSpeed,
  setDownloadSize,
}) {
  let chunks = [];
  let downloadedBytes = 0;
  let directFetchSuccess = false;
  const startTime = Date.now();

  let activeTotal = totalSize || 0;
  let localIsEstimated = isEstimated === undefined ? !activeTotal : !!isEstimated;

  // Resolve exact size from backend /api/size endpoint to ensure accurate progress/size and avoid 98% freezes
  if (localIsEstimated) {
    try {
      console.log('Resolving exact size of stream from backend /api/size...');
      const checkSizeUrl = `${API_BASE}/api/size?url=${encodeURIComponent(streamUrl)}`;
      const sizeRes = await fetch(checkSizeUrl, { signal: AbortSignal.timeout(6000) });
      if (sizeRes.ok) {
        const sizeData = await sizeRes.json();
        if (sizeData && sizeData.size && sizeData.size > 0) {
          activeTotal = sizeData.size;
          localIsEstimated = false;
          console.log(`Successfully resolved exact size from backend: ${activeTotal} bytes`);
        }
      }
    } catch (sizeErr) {
      console.warn('Failed to resolve stream size from backend:', sizeErr.message);
    }
  }

  const isCobalt = streamUrl.includes('/tunnel') || streamUrl.includes('cobalt');

  // Case 1: Cobalt stream URL (supports CORS, single-use token, NOT IP-bound)
  if (isCobalt) {
    try {
      console.log('Attempting direct browser fetch for Cobalt stream:', streamUrl);
      
      const controller = new AbortController();
      let timeoutId = setTimeout(() => {
        controller.abort();
        console.warn('Direct fetch connection timed out.');
      }, 30000); // 30 seconds initial connection timeout

      const response = await fetch(streamUrl, { signal: controller.signal });
      clearTimeout(timeoutId);

      if (!response.ok) throw new Error(`Direct fetch failed with status ${response.status}`);

      const reader = response.body.getReader();
      
      // Check both content-length and estimated-content-length from Cobalt exposed CORS headers
      let exactLength = parseInt(response.headers.get('content-length'), 10) || 0;
      let contentLength = exactLength || 
                          parseInt(response.headers.get('estimated-content-length'), 10) || 
                          activeTotal || 0;
      activeTotal = contentLength;
      localIsEstimated = !exactLength;

      if (contentLength > 0) {
        setDownloadSize(`${(contentLength / (1024 * 1024)).toFixed(1)} MB`);
      }

      // Start custom activity monitoring timeout (resets on every received chunk)
      const resetTimeout = () => {
        clearTimeout(timeoutId);
        timeoutId = setTimeout(() => {
          controller.abort();
          console.warn('Direct fetch stream hung (no data for 60 seconds). Aborting.');
        }, 60000); // 60 seconds activity timeout
      };

      resetTimeout();

      while (true) {
        let done = false;
        let value = null;
        try {
          const result = await reader.read();
          done = result.done;
          value = result.value;
        } catch (readErr) {
          const limit = exactLength || activeTotal || 0;
          if (downloadedBytes > 0 && limit > 0 && downloadedBytes >= limit * 0.9) {
            console.warn('Stream read failed near the end, but downloaded >90%. Proceeding with partial stream:', readErr.message);
            break;
          } else {
            throw readErr;
          }
        }

        if (done) break;

        resetTimeout();

        chunks.push(value);
        downloadedBytes += value.length;

        let currentTotal = activeTotal || downloadedBytes;
        if (localIsEstimated && downloadedBytes >= currentTotal * 0.9) {
          currentTotal = Math.max(currentTotal, downloadedBytes + 5 * 1024 * 1024);
          activeTotal = currentTotal;
        }

        const progress = Math.min(Math.round((downloadedBytes / currentTotal) * 100), 99);
        targetProgressRef.current = progress;

        const elapsedSeconds = (Date.now() - startTime) / 1000;
        const speed = elapsedSeconds > 0 ? (downloadedBytes / (1024 * 1024) / elapsedSeconds).toFixed(1) : '0';
        const totalMbStr = activeTotal > 0 ? `${(activeTotal / (1024 * 1024)).toFixed(1)} MB` : `${(downloadedBytes / (1024 * 1024)).toFixed(1)} MB`;
        setDownloadSpeed(`${(downloadedBytes / (1024 * 1024)).toFixed(1)} MB / ${localIsEstimated ? '~' : ''}${totalMbStr} (${speed} MB/s)`);
        setDownloadSize(totalMbStr);
      }

      clearTimeout(timeoutId);

      if (downloadedBytes === 0) throw new Error('Downloaded 0 bytes from direct stream.');

      // Anti-corruption check (only if exact content-length header was sent by server)
      if (exactLength > 0 && downloadedBytes < exactLength) {
        if (downloadedBytes >= exactLength * 0.9) {
          console.warn(`Download slightly incomplete (${downloadedBytes}/${exactLength}), but >90%. Saving partial file.`);
        } else {
          throw new Error('Download interrupted or incomplete.');
        }
      }

      directFetchSuccess = true;
    } catch (directErr) {
      console.warn('Direct Cobalt fetch failed, trying chunked proxy fallback:', directErr.message);
      // Let it fall through to Case 2 chunked proxy instead of throwing
    }
  } else {
    // Case 2: Server-generated stream URL (e.g. YouTube googlevideo.com - IP-bound, no CORS)
    // We skip direct fetch to avoid 403 blocks and go straight to chunked proxy.
    console.log('Skipping direct fetch for IP-locked server stream, using chunked proxy...');
  }

  // Fallback: chunked proxy download via Vercel (bypasses 10s timeout using small chunks)
  if (!directFetchSuccess) {
    chunks = [];
    downloadedBytes = 0;
    let start = 0;
    const chunkSize = 1.5 * 1024 * 1024; // 1.5MB chunks (balanced size for speed and Vercel limits)
    let hasMore = true;
    let activeTotal = totalSize || 0;
    let localIsEstimated = !totalSize;
    const proxyStartTime = Date.now();

    while (hasMore) {
      const end = start + chunkSize - 1;
      const actualEnd = (activeTotal > 0 && !localIsEstimated) ? Math.min(end, activeTotal - 1) : end;
      const chunkUrl = `${API_BASE}/api/chunk?url=${encodeURIComponent(streamUrl)}&start=${start}&end=${actualEnd}`;

      try {
        const chunkController = new AbortController();
        const chunkResponse = await fetch(chunkUrl, { signal: chunkController.signal });
        if (!chunkResponse.ok) {
          if (start > 0) {
            console.log("Chunk request failed (likely reached end of stream):", chunkResponse.status);
            hasMore = false;
            break;
          } else {
            throw new Error(`Proxy returned status ${chunkResponse.status}`);
          }
        }

        // Discover exact total stream size from chunkResponse headers
        if (localIsEstimated) {
          const contentRange = chunkResponse.headers.get('content-range');
          if (contentRange) {
            const match = contentRange.match(/\/(\d+)/);
            if (match) {
              const parsedSize = parseInt(match[1], 10);
              if (parsedSize > 0) {
                activeTotal = parsedSize;
                localIsEstimated = false;
                console.log(`[ChunkProxy] Discovered exact stream size from content-range: ${activeTotal} bytes`);
              }
            }
          }
          if (localIsEstimated && chunkResponse.status === 200) {
            const len = chunkResponse.headers.get('content-length');
            if (len) {
              const parsedSize = parseInt(len, 10);
              if (parsedSize > 0) {
                activeTotal = parsedSize;
                localIsEstimated = false;
                console.log(`[ChunkProxy] Discovered exact stream size from content-length: ${activeTotal} bytes`);
              }
            }
          }
        }

        const reader = chunkResponse.body.getReader();
        let chunkBytesFetched = 0;
        
        let chunkTimeoutId = null;
        const resetChunkTimeout = () => {
          clearTimeout(chunkTimeoutId);
          chunkTimeoutId = setTimeout(() => {
            chunkController.abort();
            console.warn(`Chunk stream hung at offset ${start} (no data for 15 seconds). Aborting.`);
          }, 15000);
        };

        resetChunkTimeout();

        while (true) {
          let done = false;
          let value = null;
          try {
            const result = await reader.read();
            done = result.done;
            value = result.value;
          } catch (readErr) {
            clearTimeout(chunkTimeoutId);
            // Toleration logic for connection drop during chunk read
            const limit = activeTotal || 0;
            if (downloadedBytes > 0 && (limit > 0 ? downloadedBytes >= limit * 0.9 : downloadedBytes >= 100 * 1024)) {
              console.warn('Stream read failed near the end of chunk, but downloaded >90%. Proceeding with partial stream:', readErr.message);
              done = true;
              break;
            } else {
              throw readErr;
            }
          }

          if (done) break;

          resetChunkTimeout();

          chunks.push(value);
          downloadedBytes += value.length;
          chunkBytesFetched += value.length;

          let currentTotal = activeTotal || downloadedBytes;
          if (localIsEstimated && downloadedBytes >= currentTotal * 0.9) {
            currentTotal = Math.max(currentTotal, downloadedBytes + 5 * 1024 * 1024);
            activeTotal = currentTotal;
          }

          const progress = Math.min(Math.round((downloadedBytes / currentTotal) * 100), 99);
          targetProgressRef.current = progress;

          const elapsedSeconds = (Date.now() - proxyStartTime) / 1000;
          const speed = elapsedSeconds > 0 ? (downloadedBytes / (1024 * 1024) / elapsedSeconds).toFixed(1) : '0';
          const totalMbStr = activeTotal > 0 ? `${(activeTotal / (1024 * 1024)).toFixed(1)} MB` : `${(downloadedBytes / (1024 * 1024)).toFixed(1)} MB`;
          setDownloadSpeed(`${(downloadedBytes / (1024 * 1024)).toFixed(1)} MB / ${localIsEstimated ? '~' : ''}${totalMbStr} (${speed} MB/s)`);
          setDownloadSize(totalMbStr);
        }

        clearTimeout(chunkTimeoutId);

        // If chunk is empty or smaller than requested range (and we didn't cap it by activeTotal), we reached end
        if (chunkBytesFetched === 0 || (!localIsEstimated && activeTotal > 0 && start + chunkBytesFetched >= activeTotal)) {
          hasMore = false;
        } else {
          start += chunkBytesFetched;
          // If chunkBytesFetched was smaller than chunkSize, we reached the true end of stream
          if (chunkBytesFetched < chunkSize) {
            hasMore = false;
          }
        }
      } catch (chunkErr) {
        console.error(`Chunk request failed at offset ${start}:`, chunkErr.message);
        const limit = activeTotal || 0;
        if (downloadedBytes > 0 && (limit > 0 ? downloadedBytes >= limit * 0.9 : downloadedBytes >= 100 * 1024)) {
          console.warn(`Attempting to save partial video stream (${downloadedBytes} bytes)...`);
          hasMore = false;
          break;
        } else {
          throw chunkErr;
        }
      }
    }

    if (downloadedBytes === 0) {
      throw new Error('Downloaded 0 bytes from chunked proxy.');
    }
  }

  // Create local Blob
  const mimeType = selectedQuality === 'audio' ? 'audio/mpeg' : 'video/mp4';
  return new Blob(chunks, { type: mimeType });
}

// Fallback UUID v4 generator for insecure/old browser contexts
function generateUUID() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

// Ads Block Component for displaying CPM Network ads above "How to Download"
function AdsBlock() {
  useEffect(() => {
    const ad1Container = document.getElementById('container-9559de34d01e457825192254e2a34176');
    if (ad1Container && ad1Container.innerHTML === '') {
      const script1 = document.createElement('script');
      script1.async = true;
      script1.setAttribute('data-cfasync', 'false');
      script1.src = 'https://pl29811313.effectivecpmnetwork.com/9559de34d01e457825192254e2a34176/invoke.js';
      ad1Container.appendChild(script1);
    }

    const ad2Container = document.getElementById('ad2-container');
    if (ad2Container && ad2Container.innerHTML === '') {
      window.atOptions = {
        'key' : '745e550024e015ae0395dcab4bb66ee9',
        'format' : 'iframe',
        'height' : 250,
        'width' : 300,
        'params' : {}
      };
      const script2 = document.createElement('script');
      script2.src = 'https://www.highperformanceformat.com/745e550024e015ae0395dcab4bb66ee9/invoke.js';
      ad2Container.appendChild(script2);
    }
  }, []);

  return (
    <div 
      className="ads-wrapper"
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        width: '100%',
        margin: '2.5rem 0 1rem 0',
        gap: '0.75rem'
      }}
    >
      <span style={{ 
        fontSize: '0.75rem', 
        color: 'var(--text-secondary)', 
        opacity: 0.6,
        letterSpacing: '0.05em',
        textTransform: 'uppercase',
        fontWeight: '600'
      }}>
        Sponsored Links
      </span>
      <div 
        className="ads-row" 
        style={{ 
          display: 'flex', 
          justifyContent: 'center', 
          alignItems: 'center', 
          gap: '1.5rem', 
          flexWrap: 'wrap', 
          width: '100%'
        }}
      >
        <div 
          id="container-9559de34d01e457825192254e2a34176" 
          style={{ 
            width: '300px', 
            height: '250px', 
            background: 'rgba(255,255,255,0.02)', 
            borderRadius: '12px',
            border: '1px solid var(--border-color)',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            minWidth: '300px',
            minHeight: '250px',
            overflow: 'hidden',
            boxShadow: '0 4px 20px rgba(0,0,0,0.15)'
          }}
        >
          {/* Ad 1 will inject here */}
        </div>

        <div 
          id="ad2-container" 
          style={{ 
            width: '300px', 
            height: '250px', 
            background: 'rgba(255,255,255,0.02)', 
            borderRadius: '12px',
            border: '1px solid var(--border-color)',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            minWidth: '300px',
            minHeight: '250px',
            overflow: 'hidden',
            boxShadow: '0 4px 20px rgba(0,0,0,0.15)'
          }}
        >
          {/* Ad 2 will inject here */}
        </div>
      </div>
    </div>
  );
}

function App() {
  const [visibleElements, setVisibleElements] = useState({});
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [videoInfo, setVideoInfo] = useState(null);
  const [error, setError] = useState(null);
  const [selectedQuality, setSelectedQuality] = useState('1080p');
  const [previewing, setPreviewing] = useState(false);
  const [showAnalysis, setShowAnalysis] = useState(false);

  // Redirect / Popunder State
  const [hasRedirected, setHasRedirected] = useState(false);

  // Active Download Job State
  const [jobId, setJobId] = useState(null);
  const [downloadStatus, setDownloadStatus] = useState(null); // 'downloading', 'merging', 'completed', 'error'
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [downloadSpeed, setDownloadSpeed] = useState('');
  const [downloadEta, setDownloadEta] = useState('');
  const [downloadSize, setDownloadSize] = useState('');
  const [downloadError, setDownloadError] = useState(null);
  const [completedBlobUrl, setCompletedBlobUrl] = useState('');
  const [completedFileName, setCompletedFileName] = useState('');

  const targetProgressRef = React.useRef(0);
  const displayedProgressRef = React.useRef(0);
  const smoothProgressIntervalRef = React.useRef(null);
  const downloadStatusRef = React.useRef(null);
  const crawlCounterRef = React.useRef(0);

  // Keep downloadStatusRef in sync
  useEffect(() => {
    downloadStatusRef.current = downloadStatus;
  }, [downloadStatus]);

  // Unified Smooth Progress Tracker Effect
  useEffect(() => {
    if (['starting', 'downloading', 'merging'].includes(downloadStatus)) {
      if (!smoothProgressIntervalRef.current) {
        crawlCounterRef.current = 0;
        smoothProgressIntervalRef.current = setInterval(() => {
          const current = displayedProgressRef.current;
          const target = targetProgressRef.current;
          const status = downloadStatusRef.current;

          if (status === 'completed') {
            if (current < 100) {
              const next = Math.min(100, current + 2);
              displayedProgressRef.current = next;
              setDownloadProgress(next);
            } else {
              clearInterval(smoothProgressIntervalRef.current);
              smoothProgressIntervalRef.current = null;
            }
            return;
          }

          if (status === 'error' || !status) {
            clearInterval(smoothProgressIntervalRef.current);
            smoothProgressIntervalRef.current = null;
            return;
          }

          // Active download status - step up smoothly by at most 1% or 2% per tick to avoid sudden jumps
          if (current < target) {
            const gap = target - current;
            const step = gap > 15 ? 2 : 1;
            const next = Math.min(target, current + step);
            displayedProgressRef.current = next;
            setDownloadProgress(next);
          } else {
            crawlCounterRef.current += 1;
            let ticksPerIncrement = 5; // default for starting < 40 (every 150ms at 30ms interval)
            let maxCrawl = 95;

            if (status === 'starting') {
              if (current >= 40 && current < 75) {
                ticksPerIncrement = 10; // every 300ms
              } else if (current >= 75 && current < 90) {
                ticksPerIncrement = 20; // every 600ms
              } else if (current >= 90) {
                ticksPerIncrement = 45; // every 1.35s
              }
            } else if (status === 'downloading') {
              ticksPerIncrement = 15; // every 450ms
              maxCrawl = 98;
            } else if (status === 'merging') {
              ticksPerIncrement = 30; // every 900ms
              maxCrawl = 99;
            }

            if (crawlCounterRef.current >= ticksPerIncrement) {
              crawlCounterRef.current = 0;
              if (current < maxCrawl) {
                const next = current + 1;
                displayedProgressRef.current = next;
                setDownloadProgress(next);
              }
            }
          }
        }, 30);
      }
    } else if (downloadStatus === 'completed') {
      if (!smoothProgressIntervalRef.current) {
        smoothProgressIntervalRef.current = setInterval(() => {
          const current = displayedProgressRef.current;
          if (current < 100) {
            const next = Math.min(100, current + 2);
            displayedProgressRef.current = next;
            setDownloadProgress(next);
          } else {
            clearInterval(smoothProgressIntervalRef.current);
            smoothProgressIntervalRef.current = null;
          }
        }, 30);
      }
    } else {
      if (smoothProgressIntervalRef.current) {
        clearInterval(smoothProgressIntervalRef.current);
        smoothProgressIntervalRef.current = null;
      }
    }

    return () => {
      if (smoothProgressIntervalRef.current) {
        clearInterval(smoothProgressIntervalRef.current);
        smoothProgressIntervalRef.current = null;
      }
    };
  }, [downloadStatus]);

  // Downloads History State
  const [history, setHistory] = useState([]);

  // Blog post State
  const [expandedPost, setExpandedPost] = useState(null);

  // Modal States
  const [showPrivacy, setShowPrivacy] = useState(false);
  const [showTerms, setShowTerms] = useState(false);

  // Copy Feedback States
  const [copyStates, setCopyStates] = useState({
    title: false,
    description: false,
    hashtags: false,
    all: false,
    historyItem: null
  });

  // Load history on mount
  useEffect(() => {
    const savedHistory = localStorage.getItem('any_downloader_history');
    if (savedHistory) {
      try {
        setHistory(JSON.parse(savedHistory));
      } catch (e) {
        console.error('Error loading history:', e);
      }
    }
  }, []);

  // Intersection Observer for scroll animations using React State
  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') {
      // Fallback for browsers/webviews that do not support IntersectionObserver
      const allIds = ['steps-section', 'step-card-1', 'step-card-2', 'step-card-3', 'history-section', 'blog-guides', 'app-footer'];
      const fallbackVisible = {};
      allIds.forEach(id => {
        fallbackVisible[id] = true;
      });
      setVisibleElements(fallbackVisible);
      return;
    }

    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const id = entry.target.id;
          if (id) {
            setVisibleElements(prev => {
              if (prev[id]) return prev;
              return { ...prev, [id]: true };
            });
          }
        }
      });
    }, { threshold: 0.05, rootMargin: '0px 0px -40px 0px' });

    // Target elements to animate
    const elements = document.querySelectorAll('.scroll-animate');
    elements.forEach(el => {
      if (el.id) {
        observer.observe(el);
      }
    });

    return () => {
      elements.forEach(el => {
        if (el.id) {
          observer.unobserve(el);
        }
      });
    };
  }, []); // Run once on mount! All these container sections exist in HTML on mount.

  // Save history helper
  const saveHistory = (newHistory) => {
    setHistory(newHistory);
    localStorage.setItem('any_downloader_history', JSON.stringify(newHistory));
  };

  // Clipboard Paste Helper
  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        setUrl(text);
        setError(null);
      }
    } catch (err) {
      console.warn('Clipboard read blocked.');
    }
  };

  // Extract YouTube ID
  const getYouTubeId = (urlString) => {
    if (!urlString || typeof urlString !== 'string') return null;
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
    const match = urlString.match(regExp);
    return (match && match[2].length === 11) ? match[2] : null;
  };

  // Extract Hashtags from Video details
  const getHashtags = () => {
    if (!videoInfo) return '';
    if (videoInfo.tags && Array.isArray(videoInfo.tags) && videoInfo.tags.length > 0) {
      return videoInfo.tags.join(' ');
    }
    // Regex extract from description
    const matches = videoInfo.description ? videoInfo.description.match(/#[\w\u0400-\u04FF]+/g) : null;
    return matches ? matches.join(' ') : 'No hashtags found in this video.';
  };

  // Copy Clipboard handler
  const handleCopy = (text, type) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopyStates(prev => ({ ...prev, [type]: true }));
      setTimeout(() => {
        setCopyStates(prev => ({ ...prev, [type]: false }));
      }, 1500);
    });
  };

  // Copy Combined Info handler
  const handleCopyAll = () => {
    if (!videoInfo) return;
    const hashtags = getHashtags();
    const combinedText = `TITLE:\n${videoInfo.title}\n\nHASHTAGS:\n${hashtags}\n\nDESCRIPTION:\n${videoInfo.description}`;
    handleCopy(combinedText, 'all');
  };

  // Fetch info
  const handleConfirm = async (e) => {
    if (e) e.preventDefault();
    if (!url.trim()) return;

    setLoading(true);
    setError(null);
    setVideoInfo(null);
    setPreviewing(false);
    setShowAnalysis(false);
    setSelectedQuality('1080p');
    setHasRedirected(false);

    try {
      const data = await safeFetchJson(`${API_BASE}/api/info?url=${encodeURIComponent(url.trim())}`);
      if (!data || data.error || !data.title) {
        throw new Error((data && data.error) || 'Failed to retrieve video details. Make sure the link is public and valid.');
      }
      setVideoInfo(data);
      if (data.maxHeight) {
        if (data.maxHeight >= 2160) setSelectedQuality('4k');
        else if (data.maxHeight >= 1440) setSelectedQuality('2k');
        else if (data.maxHeight >= 1080) setSelectedQuality('1080p');
        else if (data.maxHeight >= 720) setSelectedQuality('720p');
        else if (data.maxHeight >= 480) setSelectedQuality('480p');
        else setSelectedQuality('360p');
      }
    } catch (err) {
      setError(err?.message || (typeof err === 'string' ? err : 'An unknown network error occurred. Please try again.'));
    } finally {
      setLoading(false);
    }
  };

  // Start Download
  const handleDownload = async () => {
    if (!videoInfo) return;

    targetProgressRef.current = 1;
    displayedProgressRef.current = 1;
    setDownloadProgress(1);
    setDownloadStatus('starting');
    setDownloadSpeed('Initializing download engine...');
    setDownloadEta('');
    setDownloadSize('');
    setDownloadError(null);
    setCompletedBlobUrl('');
    setCompletedFileName('');

    // Map quality requests for Cobalt
    let videoQuality = '1080';
    let downloadMode = 'auto';

    if (selectedQuality === 'audio') {
      downloadMode = 'audio';
    } else {
      const cleanQuality = selectedQuality.replace('p', '');
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

    let serverDownloadSuccess = false;

    const runClientFallback = async () => {
      // Phase 2: Client-side Cobalt fallback
      let instances = [];
      try {
        setDownloadSpeed('Connecting to fallback servers...');
        const instRes = await fetch(`${API_BASE}/api/cobalt-instances`);
        if (instRes.ok) {
          const instData = await instRes.json();
          instances = instData.instances || [];
        }
      } catch (e) {
        console.warn('Failed to fetch dynamic Cobalt instances:', e);
      }

      if (instances.length === 0) {
        instances = [
          'https://dog.kittycat.boo',
          'https://cobaltapi.kittycat.boo',
          'https://rue-cobalt.xenon.zone',
          'https://fox.kittycat.boo',
          'https://api.cobalt.liubquanti.click',
          'https://api.cobalt.blackcat.sweeux.org',
          'https://cobaltapi.cjs.nz',
          'https://sunny.imput.net',
          'https://kityune.imput.net',
          'https://nachos.imput.net',
          'https://blossom.imput.net',
          'https://subito-c.meowing.de'
        ];
      }

      let success = false;
      let cobaltStreamUrl = '';
      let cobaltFileName = '';

      const targetInstances = instances.slice(0, 16);
      try {
        const promises = targetInstances.map(async (instance) => {
          const res = await fetch(instance, {
            method: 'POST',
            headers: {
              'Accept': 'application/json',
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              url: videoInfo.originalUrl,
              videoQuality: videoQuality,
              downloadMode: downloadMode
            }),
            signal: AbortSignal.timeout(10000)
          });

          if (!res.ok) throw new Error('Not ok');
          const data = await res.json();
          let resolvedUrl = '';
          let resolvedFilename = '';

          if (data && (data.status === 'redirect' || data.status === 'tunnel' || data.url)) {
            resolvedUrl = data.url;
            resolvedFilename = data.filename || `download.${selectedQuality === 'audio' ? 'mp3' : 'mp4'}`;
          } else if (data && data.status === 'picker' && data.picker && data.picker.length > 0) {
            const item = data.picker.find(p => p.type === 'video') || data.picker[0];
            resolvedUrl = item.url;
            resolvedFilename = data.filename || `download.${selectedQuality === 'audio' ? 'mp3' : 'mp4'}`;
          }

          if (resolvedUrl) {
            let precheckOk = false;
            try {
              // Pre-fetch check via chunk proxy to bypass browser CORS block and ensure stream is not empty
              console.log(`[Frontend Precheck] Verifying resolved URL from ${instance} via proxy: ${resolvedUrl}`);
              const checkUrl = `${API_BASE}/api/chunk?url=${encodeURIComponent(resolvedUrl)}&start=0&end=99`;
              const streamCheck = await fetch(checkUrl, { signal: AbortSignal.timeout(4000) });
              if (!streamCheck.ok) {
                throw new Error(`Proxy pre-check failed with status ${streamCheck.status}`);
              }
              const checkBuf = await streamCheck.arrayBuffer();
              if (checkBuf.byteLength === 0) {
                throw new Error('Proxy pre-check returned empty stream (0 bytes), likely blocked by YouTube.');
              }
              precheckOk = true;
              console.log(`[Frontend Precheck] Successfully verified stream from ${instance}!`);
            } catch (checkErr) {
              const isTimeout = checkErr.name === 'TimeoutError' || checkErr.message.toLowerCase().includes('abort') || checkErr.message.toLowerCase().includes('timeout');
              if (isTimeout) {
                precheckOk = true;
                console.log(`[Frontend Precheck Timeout] ${instance}: Slow stream, assuming on-the-fly muxing. Marking as OK.`);
              } else {
                console.warn(`[Frontend Precheck Failed] ${instance}: ${checkErr.message}`);
              }
            }

            if (precheckOk) {
              return {
                url: resolvedUrl,
                filename: resolvedFilename,
                instance
              };
            }
            throw new Error('Precheck failed');
          }
          throw new Error('Invalid format');
        });

        const fastestResult = await Promise.any(promises);
        if (fastestResult) {
          cobaltStreamUrl = fastestResult.url;
          cobaltFileName = fastestResult.filename;
          success = true;
        }
      } catch (anyErr) {
        console.warn('All parallel client-side Cobalt checks failed:', anyErr.message);
      }

      let clientDownloadSuccess = false;

      if (success) {
        targetProgressRef.current = 1;
        setDownloadStatus('downloading');
        setDownloadSpeed('Initializing stream...');
        
        let totalSize = 0;
        let isEstimated = true;

        const durationSec = videoInfo.duration_raw || 60;
        const bitrates = {
          '4k': 1.875 * 1024 * 1024,
          '2k': 0.75 * 1024 * 1024,
          '1080p': 0.375 * 1024 * 1024,
          '720p': 0.1875 * 1024 * 1024,
          '480p': 0.1 * 1024 * 1024,
          '360p': 0.0625 * 1024 * 1024,
          'audio': 0.02 * 1024 * 1024
        };
        const factor = bitrates[selectedQuality] || bitrates['1080p'];
        totalSize = Math.round(durationSec * factor);

        try {
          const finalBlob = await downloadStreamAsBlob({
            streamUrl: cobaltStreamUrl,
            totalSize,
            isEstimated,
            selectedQuality,
            setDownloadProgress,
            targetProgressRef,
            setDownloadSpeed,
            setDownloadSize,
          });

          const localDownloadUrl = URL.createObjectURL(finalBlob);
          const resolvedSize = `${(finalBlob.size / (1024 * 1024)).toFixed(1)} MB`;
          setDownloadSize(resolvedSize);

          const fileExt = selectedQuality === 'audio' ? 'mp3' : 'mp4';
          const cleanTitle = (videoInfo?.title || 'Video').replace(/[\\/:*?"<>|]/g, '_');
          const finalFileName = `[Any Downloader] - ${cleanTitle}.${fileExt}`;

          setCompletedBlobUrl(localDownloadUrl);
          setCompletedFileName(finalFileName);
          targetProgressRef.current = 100;
          displayedProgressRef.current = 100;
          setDownloadProgress(100);
          setDownloadStatus('completed');

          const downloadLink = document.createElement('a');
          downloadLink.href = localDownloadUrl;
          downloadLink.setAttribute('download', finalFileName);
          document.body.appendChild(downloadLink);
          downloadLink.click();
          downloadLink.remove();

          const newHistoryItem = {
            id: generateUUID(),
            title: videoInfo.title,
            thumbnail: videoInfo.thumbnail,
            platform: videoInfo.platform,
            quality: selectedQuality,
            size: resolvedSize,
            date: new Date().toLocaleDateString(),
            downloadUrl: localDownloadUrl
          };
          saveHistory([newHistoryItem, ...history]);
          clientDownloadSuccess = true;

        } catch (clientErr) {
          console.error('Phase 2 direct/chunked download failed:', clientErr.message);
          setDownloadStatus('error');
          setDownloadError(`Download failed: ${clientErr.message || 'Stream is empty or blocked.'}`);
          clientDownloadSuccess = false;
        }
      }

      if (!clientDownloadSuccess) {
        setDownloadStatus('error');
        setDownloadError('Download failed. Please try a different quality or link.');
      }
    };

    // Phase 1: Try server-side download first
    try {
      console.log('Attempting server-side download first...');
      setDownloadSpeed('Resolving video streams on backend...');
      
      const data = await safeFetchJson(`${API_BASE}/api/download`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: videoInfo.originalUrl,
          quality: selectedQuality,
          title: videoInfo.title
        })
      });

      if (data.streamUrl) {
        targetProgressRef.current = 1;
        setDownloadStatus('downloading');
        
        const streamUrl = data.streamUrl;
        const fileName = data.fileName;

        try {
          const finalBlob = await downloadStreamAsBlob({
            streamUrl,
            totalSize: data.totalSize,
            isEstimated: !data.totalSize,
            selectedQuality,
            setDownloadProgress,
            targetProgressRef,
            setDownloadSpeed,
            setDownloadSize,
          });

          const localDownloadUrl = URL.createObjectURL(finalBlob);
          const resolvedSize = `${(finalBlob.size / (1024 * 1024)).toFixed(1)} MB`;
          setDownloadSize(resolvedSize);

          setCompletedBlobUrl(localDownloadUrl);
          setCompletedFileName(fileName);
          targetProgressRef.current = 100;
          displayedProgressRef.current = 100;
          setDownloadProgress(100);
          setDownloadStatus('completed');

          const downloadLink = document.createElement('a');
          downloadLink.href = localDownloadUrl;
          downloadLink.setAttribute('download', fileName);
          document.body.appendChild(downloadLink);
          downloadLink.click();
          downloadLink.remove();

          // Add to local history list
          const newHistoryItem = {
            id: generateUUID(),
            title: videoInfo.title,
            thumbnail: videoInfo.thumbnail,
            platform: videoInfo.platform,
            quality: selectedQuality,
            size: resolvedSize,
            date: new Date().toLocaleDateString(),
            downloadUrl: localDownloadUrl
          };
          saveHistory([newHistoryItem, ...history]);
          serverDownloadSuccess = true;

        } catch (downloadErr) {
          console.warn('Unified download pipeline failed on backend stream, falling back to client-side Cobalt:', downloadErr.message);
          serverDownloadSuccess = false;
        }

        if (serverDownloadSuccess) {
          return;
        }
      } else {
        const activeJobId = data.jobId;
        setJobId(activeJobId);
        targetProgressRef.current = 1;
        setDownloadStatus('downloading');

        const eventSource = new EventSource(`${API_BASE}/api/progress/${activeJobId}`);

        eventSource.onmessage = (event) => {
          const jobUpdate = JSON.parse(event.data);

          setDownloadStatus(jobUpdate.status);
          targetProgressRef.current = jobUpdate.progress;
          setDownloadSpeed(jobUpdate.speed);
          setDownloadEta(jobUpdate.eta);
          setDownloadSize(jobUpdate.size);
          
          if (jobUpdate.status === 'error') {
            setDownloadError(jobUpdate.error);
            eventSource.close();
          }

          if (jobUpdate.status === 'completed') {
            eventSource.close();
            setHasRedirected(false);
            
            const fileExt = selectedQuality === 'audio' ? 'mp3' : 'mp4';
            const cleanTitle = (videoInfo?.title || 'Video').replace(/[\\/:*?"<>|]/g, '_');
            const finalFileName = `[Any Downloader] - ${cleanTitle}.${fileExt}`;
            
            setDownloadStatus('downloading');
            setDownloadSpeed('Saving file to your device...');
            
            const fileUrl = `${API_BASE}/api/file/${activeJobId}`;
            
            (async () => {
              try {
                const finalBlob = await downloadStreamAsBlob({
                  streamUrl: fileUrl,
                  totalSize: 0,
                  isEstimated: true,
                  selectedQuality,
                  setDownloadProgress,
                  targetProgressRef,
                  setDownloadSpeed,
                  setDownloadSize,
                });

                const localDownloadUrl = URL.createObjectURL(finalBlob);
                const resolvedSize = `${(finalBlob.size / (1024 * 1024)).toFixed(1)} MB`;
                setDownloadSize(resolvedSize);

                setCompletedBlobUrl(localDownloadUrl);
                setCompletedFileName(finalFileName);
                targetProgressRef.current = 100;
                displayedProgressRef.current = 100;
                setDownloadProgress(100);
                setDownloadStatus('completed');

                const downloadLink = document.createElement('a');
                downloadLink.href = localDownloadUrl;
                downloadLink.setAttribute('download', finalFileName);
                document.body.appendChild(downloadLink);
                downloadLink.click();
                downloadLink.remove();

                // Add to local history list
                const newHistoryItem = {
                  id: activeJobId,
                  title: videoInfo.title,
                  thumbnail: videoInfo.thumbnail,
                  platform: videoInfo.platform,
                  quality: selectedQuality,
                  size: resolvedSize,
                  date: new Date().toLocaleDateString(),
                  downloadUrl: localDownloadUrl
                };
                saveHistory([newHistoryItem, ...history]);
              } catch (err) {
                console.error('Failed to download file from server job:', err);
                setDownloadStatus('error');
                setDownloadError('Failed to transfer file from server to device.');
              }
            })();
          }
        };

        eventSource.onerror = () => {
          console.warn('Connection to progress server lost, falling back to client-side Cobalt...');
          eventSource.close();
          runClientFallback();
        };

        // Keep this execution path
        serverDownloadSuccess = true;
      }

    } catch (serverErr) {
      console.warn('Server-side download pipeline failed, running client-side Cobalt fallback...', serverErr.message);
    }

    if (serverDownloadSuccess) {
      return;
    }

    await runClientFallback();
  };

  // Redirection popunder handler
  const handleDownloadClick = () => {
    if (!hasRedirected) {
      const rand = Math.random();
      let redirectUrl = '';
      if (rand < 0.45) {
        redirectUrl = 'https://www.effectivecpmnetwork.com/i6feyp7446?key=a4f004e037e152799681044182ded709';
      } else if (rand < 0.90) {
        redirectUrl = 'https://www.effectivecpmnetwork.com/xyzyj37ivz?key=0794eac4293be495f938d7f6db8d7b8a';
      } else {
        redirectUrl = 'https://www.instagram.com/mubashiraliblouch/';
      }

      console.log('Opening sponsor redirect:', redirectUrl);
      window.open(redirectUrl, '_blank');
      setHasRedirected(true);
    } else {
      handleDownload();
      setHasRedirected(false);
    }
  };

  // Cancel Download handler
  const handleCancelDownload = async () => {
    if (!jobId) return;
    try {
      console.log('Sending cancellation request for:', jobId);
      await fetch(`${API_BASE}/api/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId })
      });
    } catch (e) {
      console.error('Error cancelling:', e);
    } finally {
      // Instantly reset download status so user returns to quality panel
      targetProgressRef.current = 0;
      displayedProgressRef.current = 0;
      setDownloadProgress(0);
      setDownloadStatus(null);
      setJobId(null);
      setHasRedirected(false);
    }
  };

  // Reset screen
  const handleReset = () => {
    setUrl('');
    setVideoInfo(null);
    setError(null);
    setPreviewing(false);
    setShowAnalysis(false);
    setJobId(null);
    setDownloadStatus(null);
    setHasRedirected(false);
    setCompletedBlobUrl('');
    setCompletedFileName('');
  };

  // Delete from history
  const handleDeleteHistory = (idToDelete) => {
    const updatedHistory = history.filter(item => item.id !== idToDelete);
    saveHistory(updatedHistory);
  };

  // Clear all history
  const handleClearAllHistory = () => {
    if (window.confirm('Are you sure you want to clear your download history?')) {
      saveHistory([]);
    }
  };

  // Re-download from history list
  const handleReDownload = (item) => {
    // Ad redirect
    const adLinks = [
      'https://www.effectivecpmnetwork.com/vucser5g7?key=1c9b3867e3026c0cff45008004be4981',
      'https://www.effectivecpmnetwork.com/t42wcf4kit?key=739e1cc0079a0a559606c91809494f69',
      'https://www.effectivecpmnetwork.com/fjyytihs1?key=0aab5cbbcba5618616d383aedf595df4'
    ];
    const randomAd = adLinks[Math.floor(Math.random() * adLinks.length)];
    try {
      window.open(randomAd, '_blank');
    } catch (err) {
      console.warn('Ad redirect popup blocked:', err);
    }

    const fileExt = item.quality === 'audio' ? 'mp3' : 'mp4';
    const cleanTitle = (item.title || 'Video').replace(/[\\/:*?"<>|]/g, '_');
    const finalFileName = `[Any Downloader] - ${cleanTitle}.${fileExt}`;

    const downloadLink = document.createElement('a');
    downloadLink.href = item.downloadUrl;
    downloadLink.setAttribute('download', finalFileName);
    document.body.appendChild(downloadLink);
    downloadLink.click();
    downloadLink.remove();
  };

  // Ad redirect for Save Video button click
  const handleSaveVideoClick = () => {
    const adLinks = [
      'https://www.effectivecpmnetwork.com/vucser5g7?key=1c9b3867e3026c0cff45008004be4981',
      'https://www.effectivecpmnetwork.com/t42wcf4kit?key=739e1cc0079a0a559606c91809494f69',
      'https://www.effectivecpmnetwork.com/fjyytihs1?key=0aab5cbbcba5618616d383aedf595df4'
    ];
    const randomAd = adLinks[Math.floor(Math.random() * adLinks.length)];
    try {
      window.open(randomAd, '_blank');
    } catch (err) {
      console.warn('Ad redirect popup blocked:', err);
    }
  };

  const ytId = videoInfo ? getYouTubeId(videoInfo.originalUrl) : null;

  return (
    <>
      {/* App Header */}
      <header className="app-header">
        <div className="logo-container">
          <Download className="logo-icon" size={38} strokeWidth={2.5} />
          <h1 className="app-title">Any Downloader</h1>
        </div>
        <p className="app-subtitle">
          Download high-speed playable MP4 videos and MP3 audio from YouTube, TikTok, Pinterest, and Instagram.
        </p>
      </header>

      {/* Main SaaS Card */}
      <main className="glass-card main-saas-card scroll-animate animate-in">
        {!videoInfo && !downloadStatus ? (
          // Paste Link Screen
          <div className="input-section slide-down">
            <form onSubmit={handleConfirm}>
              <div className="input-container">
                <LinkIcon className="link-icon" size={20} />
                <input 
                  type="url" 
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="Paste YouTube, TikTok, Pinterest, or Instagram link..."
                  className="url-input"
                  required
                />
                <button 
                  type="button" 
                  onClick={handlePaste}
                  className="paste-button"
                  title="Paste from clipboard"
                >
                  <Clipboard size={16} />
                  Paste
                </button>
              </div>

              <button 
                type="submit" 
                className="submit-button"
                disabled={loading || !url.trim()}
                style={{ marginTop: '1.25rem' }}
              >
                {loading ? (
                  <>
                    <RefreshCw className="spin" size={18} />
                    Analyzing Link...
                  </>
                ) : (
                  <>
                    <Sparkles size={18} />
                    Confirm Link
                  </>
                )}
              </button>
            </form>

            {error && (
              <div className="error-banner">
                <AlertTriangle size={18} />
                <span>{error}</span>
              </div>
            )}

            {/* Supported platforms (Strict lock info) */}
            <div className="supported-platforms">
              <span className="platform-tag premium-badge">
                <span className="platform-dot youtube"></span>
                YouTube
              </span>
              <span className="platform-tag premium-badge">
                <span className="platform-dot tiktok"></span>
                TikTok
              </span>
              <span className="platform-tag premium-badge">
                <span className="platform-dot pinterest"></span>
                Pinterest
              </span>
              <span className="platform-tag premium-badge">
                <span className="platform-dot instagram"></span>
                Instagram
              </span>
            </div>
          </div>
        ) : videoInfo && !downloadStatus ? (
          // Video Loaded / Confirm Quality Screen
          <div className="info-card fade-in">
            <div className="video-detail-container">
              {/* Left Column: Thumbnail or Player */}
              {previewing && ytId ? (
                <div className="player-container">
                  <iframe 
                    className="player-frame"
                    src={`https://www.youtube.com/embed/${ytId}?autoplay=1`}
                    title="YouTube video player"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" 
                    allowFullScreen
                  ></iframe>
                </div>
              ) : (
                <div className="video-thumbnail-container">
                  {videoInfo.thumbnail ? (
                    <img 
                      src={`${API_BASE}/api/proxy-image?url=${encodeURIComponent(videoInfo.thumbnail)}`} 
                      alt={videoInfo.title}
                      className="video-thumbnail"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <div className="video-thumbnail-fallback">
                      <Play className="play-icon" size={48} />
                    </div>
                  )}
                  {videoInfo.duration && videoInfo.duration !== 'Unknown' && (
                    <span className="video-duration">{videoInfo.duration}</span>
                  )}
                </div>
              )}

              {/* Right Column: Metadata */}
              <div className="video-metadata">
                <div className="video-header-details">
                  <span className={`video-platform-badge ${videoInfo.platform}`}>
                    {videoInfo.platform}
                  </span>
                  <h2 className="video-title" title={videoInfo.title}>
                    {videoInfo.title}
                  </h2>
                </div>

                <div className="action-buttons-row">
                  {ytId && (
                    <button 
                      className="action-btn preview-btn"
                      onClick={() => setPreviewing(!previewing)}
                    >
                      {previewing ? <X size={16} /> : <Play size={16} />}
                      {previewing ? 'Close Preview' : 'Play Preview'}
                    </button>
                  )}
                  <button 
                    className="action-btn reset-btn"
                    onClick={handleReset}
                  >
                    Change Link
                  </button>
                </div>
              </div>
            </div>

            {/* Quality Selector */}
            <div className="quality-section">
              <span className="section-label">Select Download Quality</span>
              <div className="quality-grid">
                {qualityOptions.map((opt) => {
                  const isAvailable = opt.value === 'audio' || !videoInfo.maxHeight || opt.height <= videoInfo.maxHeight;
                  const isSelected = selectedQuality === opt.value;

                  return (
                    <div 
                      key={opt.value}
                      className={`quality-card ${isSelected ? 'selected' : ''} ${!isAvailable ? 'disabled' : ''}`}
                      onClick={() => isAvailable && setSelectedQuality(opt.value)}
                    >
                      <span className="quality-name">
                        {opt.value === 'audio' ? <Music size={14} style={{ marginRight: '4px' }} /> : <Video size={14} style={{ marginRight: '4px' }} />}
                        {opt.value.toUpperCase()}
                      </span>
                      <span className="quality-tag">{opt.label}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Actions Grid */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginTop: '0.5rem' }}>
              {/* Download Action with Popunder Redirect Hook */}
              <button 
                onClick={handleDownloadClick}
                className="submit-button"
              >
                <Download size={18} />
                {hasRedirected ? 'Confirm & Download Now' : 'Download Video'}
              </button>

              {/* Expand Metadata Analyzer Option */}
              <button 
                className="action-btn analyzer-toggle-btn"
                onClick={() => setShowAnalysis(!showAnalysis)}
                style={{ 
                  background: 'var(--accent-light)',
                  color: 'var(--accent-primary)',
                  borderColor: 'rgba(59, 130, 246, 0.2)',
                  padding: '0.85rem'
                }}
              >
                <Search size={16} />
                {showAnalysis ? 'Hide Video Details' : 'Analyze the Video (Get Title, Tags & Desc)'}
              </button>
            </div>
            
            {hasRedirected && (
              <p style={{ fontSize: '0.785rem', color: 'var(--text-secondary)', textAlign: 'center', marginTop: '-0.25rem' }}>
                💡 Click Download again to complete the file transfer.
              </p>
            )}

            {/* Video Content Analyzer Section */}
            {showAnalysis && (
              <div className="analyzer-panel scroll-animate animate-in">
                <div className="analyzer-header">
                  <h3 className="analyzer-panel-title">Video Content Analyzer</h3>
                  <button 
                    onClick={handleCopyAll}
                    className="copy-all-btn"
                  >
                    {copyStates.all ? <Check size={14} /> : <Copy size={14} />}
                    {copyStates.all ? 'Copied Everything!' : 'Copy All Data'}
                  </button>
                </div>

                <div className="analyzer-fields-grid">
                  {/* Field 1: Title */}
                  <div className="analyzer-field-card">
                    <div className="field-label-row">
                      <span className="field-title-label">Video Title</span>
                      <button 
                        onClick={() => handleCopy(videoInfo.title || '', 'title')}
                        className="field-copy-btn"
                        title="Copy Title"
                      >
                        {copyStates.title ? <Check size={13} style={{ color: 'var(--success)' }} /> : <Copy size={13} />}
                        <span>{copyStates.title ? 'Copied' : 'Copy'}</span>
                      </button>
                    </div>
                    <div className="field-content-preview title-preview">{videoInfo.title || 'No Title'}</div>
                  </div>

                  {/* Field 2: Hashtags */}
                  <div className="analyzer-field-card">
                    <div className="field-label-row">
                      <span className="field-title-label">Extracted Hashtags</span>
                      <button 
                        onClick={() => handleCopy(getHashtags(), 'hashtags')}
                        className="field-copy-btn"
                        title="Copy Hashtags"
                      >
                        {copyStates.hashtags ? <Check size={13} style={{ color: 'var(--success)' }} /> : <Copy size={13} />}
                        <span>{copyStates.hashtags ? 'Copied' : 'Copy'}</span>
                      </button>
                    </div>
                    <div className="field-content-preview tags-preview">{getHashtags()}</div>
                  </div>

                  {/* Field 3: Description */}
                  <div className="analyzer-field-card">
                    <div className="field-label-row">
                      <span className="field-title-label">Description</span>
                      <button 
                        onClick={() => handleCopy(videoInfo.description || '', 'description')}
                        className="field-copy-btn"
                        title="Copy Description"
                      >
                        {copyStates.description ? <Check size={13} style={{ color: 'var(--success)' }} /> : <Copy size={13} />}
                        <span>{copyStates.description ? 'Copied' : 'Copy'}</span>
                      </button>
                    </div>
                    <textarea 
                      readOnly 
                      className="field-content-textarea" 
                      value={videoInfo.description || ''}
                    />
                  </div>
                </div>
              </div>
            )}
          </div>
        ) : (
          // Active Download / Progress Screen
          <div className="progress-card fade-in">
            <div className="progress-header">
              <div className="progress-title-details">
                <span className="progress-status-text">
                  {downloadStatus === 'starting' && 'Initializing download engine...'}
                  {downloadStatus === 'downloading' && 'Downloading high-speed streams...'}
                  {downloadStatus === 'merging' && 'Combining video & audio (MP4)...'}
                  {downloadStatus === 'completed' && (downloadProgress < 100 ? 'Finishing transfer...' : 'Download Ready!')}
                  {downloadStatus === 'error' && 'Something went wrong'}
                </span>
                {downloadStatus === 'downloading' && (
                  <span className="progress-speed-eta">
                    <span>Speed: <strong>{downloadSpeed}</strong></span>
                    <span>ETA: <strong>{downloadEta}</strong></span>
                    <span>Size: <strong>{downloadSize}</strong></span>
                  </span>
                )}
              </div>
              <span className="progress-pct">
                {downloadStatus === 'merging' ? '99%' : `${Math.round(downloadProgress)}%`}
              </span>
            </div>

            <div className="progress-bar-container">
              <div 
                className="progress-bar-fill" 
                style={{ width: `${downloadStatus === 'merging' ? 99 : downloadProgress}%` }}
              ></div>
            </div>

            {downloadStatus === 'completed' && downloadProgress === 100 && (
              <div className="success-badge animate-in" style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', alignItems: 'center', textAlign: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', justifyContent: 'center' }}>
                  <CheckCircle size={20} />
                  <span>Your file has been transferred! If it didn't download automatically, save it below:</span>
                </div>
                {downloadSize && (
                  <div style={{ fontSize: '0.95rem', color: 'var(--text-secondary)' }}>
                    File Size: <strong style={{ color: 'var(--success)' }}>{downloadSize}</strong>
                  </div>
                )}
                {completedBlobUrl && (
                  <a 
                    href={completedBlobUrl} 
                    download={completedFileName || 'video.mp4'} 
                    onClick={handleSaveVideoClick}
                    className="submit-button"
                    style={{ 
                      background: 'linear-gradient(135deg, #10B981 0%, #059669 100%)', 
                      color: '#ffffff',
                      border: 'none',
                      textDecoration: 'none',
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '0.5rem',
                      fontWeight: '600',
                      boxShadow: '0 4px 12px rgba(16, 185, 129, 0.2)',
                      padding: '0.75rem 1.5rem',
                      borderRadius: '8px',
                      marginTop: '0.25rem',
                      width: 'auto'
                    }}
                  >
                    <Download size={18} />
                    Save Video
                  </a>
                )}
              </div>
            )}

            {downloadStatus === 'error' && (
              <div className="error-banner">
                <AlertTriangle size={20} />
                <span>{downloadError}</span>
              </div>
            )}

            <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.5rem' }}>
              {/* Cancel Button - Active only when starting/downloading/merging */}
              {(downloadStatus === 'downloading' || downloadStatus === 'merging' || downloadStatus === 'starting') && (
                <button 
                  className="action-btn cancel-btn"
                  onClick={handleCancelDownload}
                  style={{
                    background: 'var(--danger-light)',
                    color: 'var(--danger)',
                    borderColor: 'rgba(239, 68, 68, 0.2)',
                    flex: '1'
                  }}
                >
                  <X size={16} />
                  Cancel Download
                </button>
              )}

              {/* Start new download */}
              <button 
                className="submit-button"
                style={{ 
                  flex: '2',
                  background: 'var(--bg-card)', 
                  color: 'var(--text-primary)',
                  border: '1px solid var(--border-color)',
                  boxShadow: 'none'
                }}
                onClick={handleReset}
              >
                Download Another Video
              </button>
            </div>
          </div>
        )}
      </main>

      <AdsBlock />

      {/* How it Works Section (PREMIUM Scroll Animated) */}
      <section id="steps-section" className={`steps-section premium-card scroll-animate ${visibleElements['steps-section'] ? 'animate-in' : ''}`}>
        <h2 className="section-header-title">
          <Zap className="section-title-icon" size={22} />
          How to Download Videos
        </h2>
        <div className="steps-container">
          <div id="step-card-1" className={`step-card scroll-animate delay-1 ${visibleElements['step-card-1'] ? 'animate-in' : ''}`}>
            <div className="step-badge-wrapper">
              <span className="step-badge-number">1</span>
            </div>
            <h3 className="step-card-title">Copy URL Path</h3>
            <p className="step-card-desc">
              Copy the shareable URL link from YouTube, TikTok, Pinterest, or Instagram.
            </p>
          </div>
          <div id="step-card-2" className={`step-card scroll-animate delay-2 ${visibleElements['step-card-2'] ? 'animate-in' : ''}`}>
            <div className="step-badge-wrapper">
              <span className="step-badge-number">2</span>
            </div>
            <h3 className="step-card-title">Paste & Analyze</h3>
            <p className="step-card-desc">
              Paste the link above and click Confirm. Expand the Analyzer tool to copy description metadata or tags instantly.
            </p>
          </div>
          <div id="step-card-3" className={`step-card scroll-animate delay-3 ${visibleElements['step-card-3'] ? 'animate-in' : ''}`}>
            <div className="step-badge-wrapper">
              <span className="step-badge-number">3</span>
            </div>
            <h3 className="step-card-title">Download & Save</h3>
            <p className="step-card-desc">
              Choose your quality and download. High-speed encoding delivers a standard playable MP4 file named with our SaaS label.
            </p>
          </div>
        </div>
      </section>

      {/* Downloads History Card (PREMIUM) */}
      <section id="history-section" className={`history-section premium-card scroll-animate ${visibleElements['history-section'] ? 'animate-in' : ''}`}>
        <div className="history-header">
          <div className="history-title-count">
            <History size={20} className="logo-icon" />
            <h2 className="history-title">Recent Downloads</h2>
            <span className="history-count">{history.length}</span>
          </div>
          {history.length > 0 && (
            <button 
              className="clear-history-btn"
              onClick={handleClearAllHistory}
            >
              <Trash2 size={14} />
              Clear History
            </button>
          )}
        </div>

        {history.length > 0 ? (
          <div className="history-list">
            {history.map((item) => (
              <div key={item.id} className="history-item">
                <div className="history-item-left">
                  {item.thumbnail ? (
                    <img 
                      src={`${API_BASE}/api/proxy-image?url=${encodeURIComponent(item.thumbnail)}`} 
                      alt={item.title} 
                      className="history-item-thumb"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <div className="history-item-thumb-fallback">
                      <Play size={14} />
                    </div>
                  )}
                  <div className="history-item-details">
                    <span className="history-item-title" title={item.title}>
                      {item.title}
                    </span>
                    <span className="history-item-meta">
                      <span className={`history-platform-dot ${item.platform}`}></span>
                      <span style={{ textTransform: 'capitalize' }}>{item.platform}</span>
                      <span>•</span>
                      <span style={{ textTransform: 'uppercase', fontWeight: 600 }}>{item.quality}</span>
                      {item.size && (
                        <>
                          <span>•</span>
                          <span>{item.size}</span>
                        </>
                      )}
                      <span>•</span>
                      <span>{item.date}</span>
                    </span>
                  </div>
                </div>

                <div className="history-item-right">
                  <button 
                    className="history-icon-btn"
                    onClick={() => handleReDownload(item)}
                    title="Download again"
                  >
                    <Download size={16} />
                  </button>
                  <button 
                    className="history-icon-btn delete"
                    onClick={() => handleDeleteHistory(item.id)}
                    title="Remove from history"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="empty-history-card">
            <History className="empty-history-icon" size={32} />
            <span style={{ fontWeight: 600 }}>No downloads yet</span>
            <span style={{ fontSize: '0.825rem', color: 'var(--text-muted)' }}>
              Any files you download will appear here for quick access.
            </span>
          </div>
        )}
      </section>

      {/* Search Queries Index (SEO Optimization for search bots & users) */}
      <section id="seo-keywords" className={`keywords-section premium-card scroll-animate ${visibleElements['seo-keywords'] ? 'animate-in' : ''}`} style={{ marginTop: '2rem' }}>
        <h2 className="section-header-title">
          <Search className="section-title-icon" size={22} />
          Supported Search Queries & Platforms Index
        </h2>
        <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)', marginBottom: '1.5rem', lineHeight: '1.6' }}>
          Any Downloader processes direct extraction requests for a variety of popular social media queries and search configurations. You can use our tool directly by pasting links for the following search types:
        </p>
        <div className="keywords-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1.5rem' }}>
          <div className="keyword-card" style={{ background: 'rgba(255,255,255,0.02)', padding: '1.25rem', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)', backdropFilter: 'blur(10px)' }}>
            <h4 style={{ color: 'var(--accent-primary)', marginBottom: '0.75rem', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Play size={16} /> YouTube Queries
            </h4>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, fontSize: '0.85rem', color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
              <li>• youtube download</li>
              <li>• yotube dowlond (typo search)</li>
              <li>• yt link to video dowlond</li>
              <li>• yt dowlond tool</li>
            </ul>
          </div>
          <div className="keyword-card" style={{ background: 'rgba(255,255,255,0.02)', padding: '1.25rem', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)', backdropFilter: 'blur(10px)' }}>
            <h4 style={{ color: 'var(--success)', marginBottom: '0.75rem', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Sparkles size={16} /> TikTok Queries
            </h4>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, fontSize: '0.85rem', color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
              <li>• tiktok video dowlond</li>
              <li>• tiktok video downloader</li>
              <li>• tiktok vidw=eo dowlonder</li>
              <li>• save tiktok no watermark</li>
            </ul>
          </div>
          <div className="keyword-card" style={{ background: 'rgba(255,255,255,0.02)', padding: '1.25rem', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)', backdropFilter: 'blur(10px)' }}>
            <h4 style={{ color: 'var(--accent-secondary)', marginBottom: '0.75rem', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Video size={16} /> Instagram Queries
            </h4>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, fontSize: '0.85rem', color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
              <li>• instagram video dowlond</li>
              <li>• instagram dowlond online</li>
              <li>• instagram reels saver</li>
              <li>• insta video save link</li>
            </ul>
          </div>
          <div className="keyword-card" style={{ background: 'rgba(255,255,255,0.02)', padding: '1.25rem', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)', backdropFilter: 'blur(10px)' }}>
            <h4 style={{ color: '#F59E0B', marginBottom: '0.75rem', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Info size={16} /> Pinterest Queries
            </h4>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, fontSize: '0.85rem', color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
              <li>• pinterest video download</li>
              <li>• pinterest dowlond online</li>
              <li>• pinterest video odwlond</li>
              <li>• save pinterest image/gif</li>
            </ul>
          </div>
        </div>
      </section>

      {/* Blog Section (PREMIUM & SEO OPTIMIZED) */}
      <section id="blog-guides" className={`blog-section premium-card scroll-animate ${visibleElements['blog-guides'] ? 'animate-in' : ''}`}>
        <h2 className="section-header-title">
          <BookOpen className="section-title-icon" size={22} />
          Guides & Video Downloader Insights
        </h2>
        <div className="blog-grid">
          {blogPosts.map((post, idx) => {
            const isExpanded = expandedPost === idx;
            return (
              <article 
                key={idx} 
                className={`blog-card ${isExpanded ? 'active' : ''}`}
                style={{ transitionDelay: `${idx * 0.05}s`, cursor: 'pointer' }}
                id={`blog-post-${idx}`}
                onClick={() => setExpandedPost(isExpanded ? null : idx)}
              >
                <div className="blog-meta">
                  <span className="blog-category">{post.category}</span>
                  <span className="blog-read-time">{post.readTime}</span>
                </div>
                <h3 className="blog-title">{post.title}</h3>
                <p className="blog-excerpt">{post.excerpt}</p>
                <div className={`blog-content ${isExpanded ? 'open' : ''}`}>
                  {post.content.map((pText, pIdx) => (
                    <p key={pIdx}>{pText}</p>
                  ))}
                </div>
                <button 
                  className="read-more-btn"
                  id={`blog-btn-${idx}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    setExpandedPost(isExpanded ? null : idx);
                  }}
                >
                  {isExpanded ? 'Show Less' : 'Read Full Guide'}
                  <ChevronDown className={`btn-arrow-icon ${isExpanded ? 'rotated' : ''}`} size={16} />
                </button>
              </article>
            );
          })}
        </div>
      </section>

      {/* Footer */}
      <footer id="app-footer" className={`app-footer scroll-animate ${visibleElements['app-footer'] ? 'animate-in' : ''}`}>
        <p>&copy; {new Date().getFullYear()} Any Downloader. Created with ❤️ for clean Web SaaS.</p>
        <div className="footer-links">
          <button onClick={() => setShowPrivacy(true)} className="footer-link-btn">Privacy Policy</button>
          <span>•</span>
          <button onClick={() => setShowTerms(true)} className="footer-link-btn">Terms of Service</button>
          <span>•</span>
          <a href="https://www.instagram.com/mubashiraliblouch/" target="_blank" rel="noopener noreferrer" className="footer-link">Contact Developer</a>
        </div>
      </footer>

      {/* Privacy Policy Modal */}
      {showPrivacy && (
        <div className="modal-overlay" onClick={() => setShowPrivacy(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <ShieldCheck size={24} style={{ color: 'var(--success)' }} />
                <h2 className="modal-title">Privacy Policy</h2>
              </div>
              <button className="modal-close-btn" onClick={() => setShowPrivacy(false)}>
                <X size={20} />
              </button>
            </div>
            <div className="modal-body">
              <p><strong>Last Updated: June 2026</strong></p>
              <p>Welcome to Any Downloader. We respect your privacy and are committed to protecting any information associated with your usage.</p>
              
              <h3>1. Data Collection & Hosting</h3>
              <p>We do not collect or log personal user identification details. When you paste a URL to analyze or download, that media link is processed entirely in volatile server memory. Downloaded video files are stored temporarily on our server for a maximum of 5 minutes to permit reliable local delivery, after which they are deleted permanently.</p>
              
              <h3>2. Browser Storage</h3>
              <p>This web application utilizes your browser's local sandbox storage (<code>localStorage</code>) to cache a list of your recent downloads (video title, thumbnail link, date). This data is kept 100% locally on your computer and is never shared, leaked, or sent to our databases.</p>

              <h3>3. External Redirects & Ad Networks</h3>
              <p>We work with third-party ad networks (such as EffectiveCPMNetwork) to maintain and scale our premium conversion features. First clicks on downloads may open sponsored links in new tabs. These networks may track cookies or browser metadata under their respective privacy policies.</p>
            </div>
          </div>
        </div>
      )}

      {/* Terms of Service Modal */}
      {showTerms && (
        <div className="modal-overlay" onClick={() => setShowTerms(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Info size={24} style={{ color: 'var(--accent-primary)' }} />
                <h2 className="modal-title">Terms of Service</h2>
              </div>
              <button className="modal-close-btn" onClick={() => setShowTerms(false)}>
                <X size={20} />
              </button>
            </div>
            <div className="modal-body">
              <p><strong>Last Updated: June 2026</strong></p>
              <p>By using the Any Downloader web SaaS utility, you agree to comply with the following regulations:</p>
              
              <h3>1. Permitted Use & Copyright</h3>
              <p>Any Downloader is designed for personal archival, research, and non-commercial media backup. You are solely responsible for ensuring that you have the right to download copyright-restricted materials under the terms of service of the originating platform (YouTube, TikTok, Pinterest, or Instagram).</p>
              
              <h3>2. Prohibited Content</h3>
              <p>Downloads from adult websites, explicit domains, and other harmful resources are strictly restricted on our backend servers. Attempts to bypass these filters are logged and blocked automatically.</p>

              <h3>3. Monetization Redirects</h3>
              <p>As a free user, you acknowledge that click actions on download elements will periodically redirect you to sponsored marketing web pages. This monetization enables the application to continue running free high-speed downloads without subscription charges.</p>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("ErrorBoundary caught an error", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          padding: '2.5rem',
          maxWidth: '600px',
          margin: '4rem auto',
          background: 'var(--bg-card, #ffffff)',
          borderRadius: '16px',
          boxShadow: '0 10px 30px rgba(0,0,0,0.1)',
          border: '1px solid var(--border-color, #eaeaea)',
          textAlign: 'center',
          fontFamily: 'Inter, sans-serif'
        }}>
          <h2 style={{ color: 'var(--danger, #EF4444)', marginBottom: '1rem' }}>Something went wrong</h2>
          <p style={{ color: 'var(--text-secondary, #4B5563)', marginBottom: '1.5rem' }}>
            The application crashed due to an unexpected error. You can reload the page or clear cache.
          </p>
          <pre style={{
            background: '#F3F4F6',
            padding: '1rem',
            borderRadius: '8px',
            textAlign: 'left',
            overflowX: 'auto',
            fontSize: '0.85rem',
            color: '#1F2937',
            marginBottom: '2rem'
          }}>
            {this.state.error?.toString()}
          </pre>
          <button 
            onClick={() => {
              localStorage.removeItem('any_downloader_history');
              window.location.reload();
            }}
            style={{
              background: 'var(--accent-primary, #3B82F6)',
              color: '#ffffff',
              border: 'none',
              padding: '0.75rem 1.5rem',
              borderRadius: '8px',
              fontWeight: '600',
              cursor: 'pointer'
            }}
          >
            Clear Cache & Reload App
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

export default function SafeApp() {
  return (
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  );
}

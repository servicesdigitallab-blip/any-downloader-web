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

function App() {
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

  // Intersection Observer for scroll animations
  useEffect(() => {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('animate-in');
        }
      });
    }, { threshold: 0.05, rootMargin: '0px 0px -40px 0px' });

    // Target elements to animate
    const elements = document.querySelectorAll('.scroll-animate');
    elements.forEach(el => observer.observe(el));

    return () => {
      elements.forEach(el => observer.unobserve(el));
    };
  }, [videoInfo, downloadStatus, showPrivacy, showTerms, showAnalysis, history]); // Re-observe when UI shifts

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
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Start Download
  const handleDownload = async () => {
    if (!videoInfo) return;

    setDownloadStatus('starting');
    setDownloadProgress(0);
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
    let cobaltStreamUrl = '';
    let cobaltFileName = '';

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
        if (data.direct) {
          // Direct Download link (like Cobalt) - download directly via same-origin proxy to bypass CORS!
          setDownloadStatus('downloading');
          setDownloadProgress(0);
          
          const streamUrl = data.streamUrl;
          const fileName = data.fileName;

          try {
            // Use same-origin proxy to bypass CORS and expose Content-Length
            const proxyUrl = `${API_BASE}/api/chunk?url=${encodeURIComponent(streamUrl)}`;
            const response = await fetch(proxyUrl);
            if (!response.ok) {
              throw new Error('Failed to download video from proxy stream.');
            }

            const reader = response.body.getReader();
            const contentLength = parseInt(response.headers.get('content-length'), 10) || 0;
            let displaySize = '';
            let totalBytesForProgress = contentLength;

            if (contentLength > 0) {
              displaySize = `${(contentLength / (1024 * 1024)).toFixed(1)} MB`;
              setDownloadSize(displaySize);
            } else {
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
              const estimatedSize = Math.round(durationSec * factor);
              totalBytesForProgress = estimatedSize;
              displaySize = `~${(estimatedSize / (1024 * 1024)).toFixed(1)} MB`;
              setDownloadSize(displaySize);
            }

            let receivedLength = 0;
            const chunks = [];
            const startTime = Date.now();

            while (true) {
              const { done, value } = await reader.read();
              if (done) break;

              chunks.push(value);
              receivedLength += value.length;

              let activeTotal = totalBytesForProgress || receivedLength;
              if ((!contentLength || contentLength === 0) && receivedLength >= activeTotal * 0.9) {
                activeTotal = Math.max(activeTotal, receivedLength + 5 * 1024 * 1024);
                totalBytesForProgress = activeTotal;
                displaySize = `~${(activeTotal / (1024 * 1024)).toFixed(1)} MB`;
                setDownloadSize(displaySize);
              }

              const progress = Math.min(Math.round((receivedLength / activeTotal) * 100), 99);
              setDownloadProgress(progress);
              
              // Calculate speed
              const elapsedSeconds = (Date.now() - startTime) / 1000;
              const speed = elapsedSeconds > 0 ? (receivedLength / (1024 * 1024) / elapsedSeconds).toFixed(1) : '0';
              setDownloadSpeed(`${(receivedLength / (1024 * 1024)).toFixed(1)} MB / ${displaySize} (${speed} MB/s)`);
            }

            if (receivedLength === 0) {
              throw new Error('Downloaded 0 bytes from fallback stream.');
            }

            const finalBlob = new Blob(chunks, { type: selectedQuality === 'audio' ? 'audio/mpeg' : 'video/mp4' });
            const localDownloadUrl = URL.createObjectURL(finalBlob);

            setCompletedBlobUrl(localDownloadUrl);
            setCompletedFileName(fileName);
            setDownloadStatus('completed');
            setDownloadProgress(100);

            const downloadLink = document.createElement('a');
            downloadLink.href = localDownloadUrl;
            downloadLink.setAttribute('download', fileName);
            document.body.appendChild(downloadLink);
            downloadLink.click();
            downloadLink.remove();

            // Add to local history list
            const newHistoryItem = {
              id: crypto.randomUUID(),
              title: videoInfo.title,
              thumbnail: videoInfo.thumbnail,
              platform: videoInfo.platform,
              quality: selectedQuality,
              date: new Date().toLocaleDateString(),
              downloadUrl: localDownloadUrl
            };
            saveHistory([newHistoryItem, ...history]);
            serverDownloadSuccess = true;
          } catch (fetchErr) {
            console.error('Direct download proxy stream read failed, falling back to basic download redirect:', fetchErr);
            // Fallback: if browser fetch/cors fails, fall back to simple direct redirect download
            setCompletedBlobUrl(streamUrl);
            setCompletedFileName(fileName);
            setDownloadStatus('completed');
            setDownloadProgress(100);
            
            const downloadLink = document.createElement('a');
            downloadLink.href = streamUrl;
            downloadLink.setAttribute('download', fileName);
            downloadLink.setAttribute('target', '_blank');
            downloadLink.setAttribute('rel', 'noreferrer'); // IMPORTANT: bypass hotlinking blocks!
            document.body.appendChild(downloadLink);
            downloadLink.click();
            downloadLink.remove();
            serverDownloadSuccess = true;
          }
          return;
        }

        if (data.totalSize) {
          // Vercel Serverless / Client-Side Chunked Downloading
          setDownloadStatus('downloading');
          setDownloadProgress(0);
          setDownloadSize(`${(data.totalSize / (1024 * 1024)).toFixed(1)} MB`);
          
          const totalSize = data.totalSize;
          const streamUrl = data.streamUrl;
          const fileName = data.fileName;
          
          const chunkSize = 4 * 1024 * 1024; // 4MB chunks
          let start = 0;
          const chunks = [];
          let downloadedBytes = 0;

          while (start < totalSize) {
            const end = Math.min(start + chunkSize - 1, totalSize - 1);
            const chunkUrl = `${API_BASE}/api/chunk?url=${encodeURIComponent(streamUrl)}&start=${start}&end=${end}`;
            
            const chunkResponse = await fetch(chunkUrl);
            if (!chunkResponse.ok) {
              throw new Error('Error downloading video chunk. Vercel connection limits exceeded.');
            }
            
            const chunkBlob = await chunkResponse.blob();
            chunks.push(chunkBlob);
            
            downloadedBytes += (end - start + 1);
            const progress = Math.round((downloadedBytes / totalSize) * 100);
            setDownloadProgress(progress);
            
            // Show progress details
            setDownloadSpeed(`${(downloadedBytes / (1024 * 1024)).toFixed(1)} MB / ${(totalSize / (1024 * 1024)).toFixed(1)} MB`);
            
            start = end + 1;
          }

          const finalBlob = new Blob(chunks, { type: selectedQuality === 'audio' ? 'audio/mpeg' : 'video/mp4' });
          const localDownloadUrl = URL.createObjectURL(finalBlob);
          
          setCompletedBlobUrl(localDownloadUrl);
          setCompletedFileName(fileName);
          setDownloadStatus('completed');
          setDownloadProgress(100);

          const downloadLink = document.createElement('a');
          downloadLink.href = localDownloadUrl;
          downloadLink.setAttribute('download', fileName);
          document.body.appendChild(downloadLink);
          downloadLink.click();
          downloadLink.remove();
          
          // Add to local history list
          const newHistoryItem = {
            id: crypto.randomUUID(),
            title: videoInfo.title,
            thumbnail: videoInfo.thumbnail,
            platform: videoInfo.platform,
            quality: selectedQuality,
            date: new Date().toLocaleDateString(),
            downloadUrl: localDownloadUrl
          };
          saveHistory([newHistoryItem, ...history]);
          serverDownloadSuccess = true;
          return;
        }
      }

      const activeJobId = data.jobId;
      setJobId(activeJobId);
      setDownloadStatus('downloading');

      const eventSource = new EventSource(`${API_BASE}/api/progress/${activeJobId}`);

      eventSource.onmessage = (event) => {
        const jobUpdate = JSON.parse(event.data);

        setDownloadStatus(jobUpdate.status);
        setDownloadProgress(jobUpdate.progress);
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
          
          setCompletedBlobUrl(`${API_BASE}/api/file/${activeJobId}`);
          setCompletedFileName(finalFileName);

          const downloadLink = document.createElement('a');
          downloadLink.href = `${API_BASE}/api/file/${activeJobId}`;
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
            date: new Date().toLocaleDateString(),
            downloadUrl: `${API_BASE}/api/file/${activeJobId}`
          };
          saveHistory([newHistoryItem, ...history]);
        }
      };

      eventSource.onerror = () => {
        setDownloadStatus('error');
        setDownloadError('Connection to progress server lost.');
        eventSource.close();
      };

      // Keep this execution path
      serverDownloadSuccess = true;

    } catch (serverErr) {
      console.warn('Server-side download pipeline failed, running client-side Cobalt fallback...', serverErr.message);
    }

    if (serverDownloadSuccess) {
      return;
    }

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
        'https://api.cobalt.blackcat.sweeux.org',
        'https://rue-cobalt.xenon.zone',
        'https://dog.kittycat.boo',
        'https://cobaltapi.kittycat.boo',
        'https://fox.kittycat.boo',
        'https://cobaltapi.cjs.nz',
        'https://sunny.imput.net',
        'https://kityune.imput.net',
        'https://nachos.imput.net',
        'https://blossom.imput.net',
        'https://api.dl.woof.monster'
      ];
    }

    let success = false;

    const targetInstances = instances.slice(0, 8);
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
          signal: AbortSignal.timeout(3000)
        });

        if (!res.ok) throw new Error('Not ok');
        const data = await res.json();
        if (data && (data.status === 'redirect' || data.status === 'tunnel' || data.url)) {
          return {
            url: data.url,
            filename: data.filename || `download.${selectedQuality === 'audio' ? 'mp3' : 'mp4'}`,
            instance
          };
        } else if (data && data.status === 'picker' && data.picker && data.picker.length > 0) {
          const item = data.picker.find(p => p.type === 'video') || data.picker[0];
          return {
            url: item.url,
            filename: data.filename || `download.${selectedQuality === 'audio' ? 'mp3' : 'mp4'}`,
            instance
          };
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
      setDownloadStatus('downloading');
      setDownloadProgress(0);
      setDownloadSpeed('Initializing stream...');
      
      let totalSize = 0;
      let isEstimated = false;

      try {
        totalSize = await getUrlTotalSize(cobaltStreamUrl);
      } catch (e) {
        console.warn('Could not determine total size of stream:', e);
      }

      if (!totalSize) {
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
        isEstimated = true;
      }

      let directFetchSuccess = false;
      const chunks = [];

      try {
        console.log('Attempting direct browser fetch for:', cobaltStreamUrl);
        const response = await fetch(cobaltStreamUrl);
        if (!response.ok) throw new Error(`Direct fetch returned status ${response.status}`);

        const reader = response.body.getReader();
        let receivedLength = 0;
        const startTime = Date.now();

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          chunks.push(value);
          receivedLength += value.length;

          let activeTotal = totalSize || receivedLength;
          if (isEstimated && receivedLength >= activeTotal * 0.9) {
            activeTotal = Math.max(activeTotal, receivedLength + 5 * 1024 * 1024);
            totalSize = activeTotal;
          }

          const progress = Math.min(Math.round((receivedLength / activeTotal) * 100), 99);
          setDownloadProgress(progress);

          const elapsedSeconds = (Date.now() - startTime) / 1000;
          const speed = elapsedSeconds > 0 ? (receivedLength / (1024 * 1024) / elapsedSeconds).toFixed(1) : '0';
          setDownloadSpeed(`${(receivedLength / (1024 * 1024)).toFixed(1)} MB / ${isEstimated ? '~' : ''}${(totalSize / (1024 * 1024)).toFixed(1)} MB (${speed} MB/s)`);
        }

        if (receivedLength === 0) throw new Error('Downloaded 0 bytes from direct stream.');
        directFetchSuccess = true;
      } catch (directErr) {
        console.warn('Direct client-side stream download failed (CORS or network), falling back to chunked proxy download:', directErr.message);
      }

      if (!directFetchSuccess) {
        if (totalSize > 0 && !isEstimated) {
          try {
            console.log('Starting chunked proxy download for:', cobaltStreamUrl);
            setDownloadSpeed('Downloading via proxy chunks...');
            const chunkSize = 4 * 1024 * 1024;
            let start = 0;
            let downloadedBytes = 0;
            const startTime = Date.now();

            while (start < totalSize) {
              const end = Math.min(start + chunkSize - 1, totalSize - 1);
              const chunkUrl = `${API_BASE}/api/chunk?url=${encodeURIComponent(cobaltStreamUrl)}&start=${start}&end=${end}`;
              
              const chunkResponse = await fetch(chunkUrl);
              if (!chunkResponse.ok) throw new Error('Error downloading video chunk via proxy.');
              
              const chunkBlob = await chunkResponse.blob();
              chunks.push(chunkBlob);
              
              downloadedBytes += (end - start + 1);
              const progress = Math.min(Math.round((downloadedBytes / totalSize) * 100), 99);
              setDownloadProgress(progress);

              const elapsedSeconds = (Date.now() - startTime) / 1000;
              const speed = elapsedSeconds > 0 ? (downloadedBytes / (1024 * 1024) / elapsedSeconds).toFixed(1) : '0';
              setDownloadSpeed(`${(downloadedBytes / (1024 * 1024)).toFixed(1)} MB / ${(totalSize / (1024 * 1024)).toFixed(1)} MB (${speed} MB/s)`);
              
              start = end + 1;
            }
            directFetchSuccess = true;
          } catch (proxyErr) {
            console.error('Chunked proxy download failed:', proxyErr.message);
          }
        }
      }

      if (directFetchSuccess && chunks.length > 0) {
        const finalBlob = new Blob(chunks, { type: selectedQuality === 'audio' ? 'audio/mpeg' : 'video/mp4' });
        const localDownloadUrl = URL.createObjectURL(finalBlob);

        const fileExt = selectedQuality === 'audio' ? 'mp3' : 'mp4';
        const cleanTitle = (videoInfo?.title || 'Video').replace(/[\\/:*?"<>|]/g, '_');
        const finalFileName = `[Any Downloader] - ${cleanTitle}.${fileExt}`;

        setCompletedBlobUrl(localDownloadUrl);
        setCompletedFileName(finalFileName);
        setDownloadStatus('completed');
        setDownloadProgress(100);

        const downloadLink = document.createElement('a');
        downloadLink.href = localDownloadUrl;
        downloadLink.setAttribute('download', finalFileName);
        document.body.appendChild(downloadLink);
        downloadLink.click();
        downloadLink.remove();

        const newHistoryItem = {
          id: crypto.randomUUID(),
          title: videoInfo.title,
          thumbnail: videoInfo.thumbnail,
          platform: videoInfo.platform,
          quality: selectedQuality,
          date: new Date().toLocaleDateString(),
          downloadUrl: localDownloadUrl
        };
        saveHistory([newHistoryItem, ...history]);
        clientDownloadSuccess = true;
      }
    }

    if (clientDownloadSuccess) {
      return;
    }

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
      setDownloadStatus(null);
      setJobId(null);
      setDownloadProgress(0);
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
    window.open(item.downloadUrl, '_blank');
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
                  <img 
                    src={videoInfo.thumbnail} 
                    alt={videoInfo.title}
                    className="video-thumbnail"
                    referrerPolicy="no-referrer"
                  />
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
                  {downloadStatus === 'completed' && 'Download Ready!'}
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

            {downloadStatus === 'completed' && (
              <div className="success-badge animate-in" style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', alignItems: 'center', textAlign: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', justifyContent: 'center' }}>
                  <CheckCircle size={20} />
                  <span>Your file has been transferred! If it didn't download automatically, save it below:</span>
                </div>
                {completedBlobUrl && (
                  <a 
                    href={completedBlobUrl} 
                    download={completedFileName || 'video.mp4'} 
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

      {/* How it Works Section (PREMIUM Scroll Animated) */}
      <section className="steps-section premium-card scroll-animate">
        <h2 className="section-header-title">
          <Zap className="section-title-icon" size={22} />
          How to Download Videos
        </h2>
        <div className="steps-container">
          <div className="step-card scroll-animate delay-1">
            <div className="step-badge-wrapper">
              <span className="step-badge-number">1</span>
            </div>
            <h3 className="step-card-title">Copy URL Path</h3>
            <p className="step-card-desc">
              Copy the shareable URL link from YouTube, TikTok, Pinterest, or Instagram.
            </p>
          </div>
          <div className="step-card scroll-animate delay-2">
            <div className="step-badge-wrapper">
              <span className="step-badge-number">2</span>
            </div>
            <h3 className="step-card-title">Paste & Analyze</h3>
            <p className="step-card-desc">
              Paste the link above and click Confirm. Expand the Analyzer tool to copy description metadata or tags instantly.
            </p>
          </div>
          <div className="step-card scroll-animate delay-3">
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
      <section className="history-section premium-card scroll-animate">
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
                  <img 
                    src={item.thumbnail} 
                    alt={item.title} 
                    className="history-item-thumb"
                    referrerPolicy="no-referrer"
                  />
                  <div className="history-item-details">
                    <span className="history-item-title" title={item.title}>
                      {item.title}
                    </span>
                    <span className="history-item-meta">
                      <span className={`history-platform-dot ${item.platform}`}></span>
                      <span style={{ textTransform: 'capitalize' }}>{item.platform}</span>
                      <span>•</span>
                      <span style={{ textTransform: 'uppercase', fontWeight: 600 }}>{item.quality}</span>
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

      {/* Blog Section (PREMIUM & SEO OPTIMIZED) */}
      <section className="blog-section premium-card scroll-animate" id="blog-guides">
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
      <footer className="app-footer scroll-animate">
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

export default App;

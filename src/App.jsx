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
const faqs = [
  {
    q: 'Is Any Downloader free to use?',
    a: 'Yes! Any Downloader is a 100% free premium utility. We do not require account registrations or subscriptions. We maintain our high-speed download servers through advertising redirects.'
  },
  {
    q: 'Why does the site redirect me on the first download click?',
    a: 'To support unlimited, high-speed 1080p/4K merging and conversion pipelines for free, we use a single click-through redirect system. The first click opens a sponsored partner link in a new tab, and the second click instantly starts your download. We appreciate your support!'
  },
  {
    q: 'Which platforms are supported?',
    a: 'We support all major social media platforms and video sharing channels, including YouTube, TikTok, Pinterest, and Instagram.'
  },
  {
    q: 'Can I download videos in 4K resolution?',
    a: 'Absolutely! If the source video was uploaded in 4K (2160p) or 2K (1440p), Any Downloader will parse and show the 4K/2K quality cards for you. If the source only goes up to 1080p, quality choices will adjust automatically.'
  },
  {
    q: 'How does the custom file naming work?',
    a: 'Every video downloaded is formatted and structured to carry our signature name tag: "[Any Downloader] - <Video Title>.<ext>". This helps you organize your video and audio library cleanly.'
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

  // Downloads History State
  const [history, setHistory] = useState([]);

  // Accordion State
  const [openFaq, setOpenFaq] = useState(null);

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
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
    const match = urlString.match(regExp);
    return (match && match[2].length === 11) ? match[2] : null;
  };

  // Extract Hashtags from Video details
  const getHashtags = () => {
    if (!videoInfo) return '';
    if (videoInfo.tags && videoInfo.tags.length > 0) {
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
      const response = await fetch(`/api/info?url=${encodeURIComponent(url.trim())}`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to fetch video details.');
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
    setDownloadSpeed('');
    setDownloadEta('');
    setDownloadSize('');
    setDownloadError(null);

    try {
      const response = await fetch('/api/download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: videoInfo.originalUrl,
          quality: selectedQuality,
          title: videoInfo.title
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to start download.');
      }

      const activeJobId = data.jobId;
      setJobId(activeJobId);
      setDownloadStatus('downloading');

      const eventSource = new EventSource(`/api/progress/${activeJobId}`);

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
          
          const downloadLink = document.createElement('a');
          downloadLink.href = `/api/file/${activeJobId}`;
          downloadLink.setAttribute('download', '');
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
            downloadUrl: `/api/file/${activeJobId}`
          };
          saveHistory([newHistoryItem, ...history]);
        }
      };

      eventSource.onerror = () => {
        setDownloadStatus('error');
        setDownloadError('Connection to progress server lost.');
        eventSource.close();
      };

    } catch (err) {
      setDownloadStatus('error');
      setDownloadError(err.message);
    }
  };

  // Redirection popunder
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
      await fetch('/api/cancel', {
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
                  />
                  <span className="video-duration">{videoInfo.duration}</span>
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
                        onClick={() => handleCopy(videoInfo.title, 'title')}
                        className="field-copy-btn"
                        title="Copy Title"
                      >
                        {copyStates.title ? <Check size={13} style={{ color: 'var(--success)' }} /> : <Copy size={13} />}
                        <span>{copyStates.title ? 'Copied' : 'Copy'}</span>
                      </button>
                    </div>
                    <div className="field-content-preview title-preview">{videoInfo.title}</div>
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
                        onClick={() => handleCopy(videoInfo.description, 'description')}
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
                      value={videoInfo.description}
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
              <div className="success-badge animate-in">
                <CheckCircle size={20} />
                <span>Your file has been transferred. You can check your downloads folder!</span>
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
              <div key={item.id} className="history-item scroll-animate">
                <div className="history-item-left">
                  <img 
                    src={item.thumbnail} 
                    alt={item.title} 
                    className="history-item-thumb"
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

      {/* Blog & FAQ Section (PREMIUM) */}
      <section className="faq-section premium-card scroll-animate">
        <h2 className="section-header-title">
          <BookOpen className="section-title-icon" size={22} />
          FAQ & Knowledge Base
        </h2>
        <div className="faq-list">
          {faqs.map((faq, idx) => {
            const isOpen = openFaq === idx;
            return (
              <div 
                key={idx} 
                className={`faq-item scroll-animate ${isOpen ? 'active' : ''}`}
                style={{ transitionDelay: `${idx * 0.05}s` }}
              >
                <button 
                  className="faq-question-btn"
                  onClick={() => setOpenFaq(isOpen ? null : idx)}
                >
                  <span className="faq-question">{faq.q}</span>
                  <ChevronDown className={`faq-arrow-icon ${isOpen ? 'rotated' : ''}`} size={18} />
                </button>
                <div className={`faq-answer-container ${isOpen ? 'open' : ''}`}>
                  <p className="faq-answer">{faq.a}</p>
                </div>
              </div>
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

import { useState, useEffect, useRef, useCallback } from "react";
import { Link } from "react-router-dom";
import { Search } from "lucide-react";
import Plyr from "plyr";
import "plyr/dist/plyr.css";
import "./App.css";
import type { Video } from "./types";

interface VideoCardProps {
  video: Video;
  onClick: () => void;
}

function VideoCard({ video, onClick }: VideoCardProps) {
  const [isVisible, setIsVisible] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: "100px" }
    );

    if (cardRef.current) {
      observer.observe(cardRef.current);
    }

    return () => observer.disconnect();
  }, []);

  return (
    <div ref={cardRef} className="video-card" onClick={onClick}>
      <div className="video-thumbnail">
        {isVisible ? (
          video.thumbnail ? (
            <img src={video.thumbnail} alt={video.title} loading="lazy" />
          ) : (
            <div className="video-placeholder"></div>
          )
        ) : (
          <div className="video-placeholder skeleton"></div>
        )}
        {video.duration && <div className="video-duration">{video.duration}</div>}
      </div>
      <div className="video-info">
        <h3 className="video-title">{video.title}</h3>
        <p className="video-meta">{video.size || "Unknown size"}</p>
      </div>
    </div>
  );
}

function App() {
  const [videos, setVideos] = useState<Video[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedVideo, setSelectedVideo] = useState<Video | null>(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [search, setSearch] = useState("");
  const videoRef = useRef<HTMLVideoElement>(null);
  const playerRef = useRef<Plyr | null>(null);

  const openModal = (video: Video) => {
    setSelectedVideo(video);
    setTimeout(() => setModalVisible(true), 10);
  };

  const closeModal = useCallback(() => {
    setModalVisible(false);
    setTimeout(() => {
      if (playerRef.current) {
        playerRef.current.destroy();
        playerRef.current = null;
      }
      setSelectedVideo(null);
    }, 300);
  }, []);

  // ESC key to close modal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && selectedVideo) {
        closeModal();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedVideo, closeModal]);

  useEffect(() => {
    if (selectedVideo && videoRef.current && !playerRef.current) {
      playerRef.current = new Plyr(videoRef.current, {
        controls: ['play-large', 'play', 'progress', 'current-time', 'mute', 'volume', 'fullscreen'],
        keyboard: { focused: true, global: true },
      });
    }
  }, [selectedVideo]);

  useEffect(() => {
    fetch("/api/videos")
      .then((r) => r.json())
      .then((data) => {
        setVideos(data.videos || []);
        setLoading(false);
      })
      .catch(() => {
        setVideos([]);
        setLoading(false);
      });
  }, []);

  return (
    <div className="app">
      <nav className="nav">
        <div className="container nav-content">
          <div className="nav-logo">
            VIDEO<span>LIB</span>
          </div>

          <div className="nav-search-wrapper">
            <Search size={18} className="nav-search-icon" />
            <input
              type="text"
              className="nav-search"
              placeholder="Search videos..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <div className="nav-right">
            <Link to="/manager" className="nav-btn">Manager</Link>
            <a href="/terminal" target="_blank" rel="noopener noreferrer" className="nav-btn">Terminal</a>
            <button className="nav-btn">Upload</button>
          </div>
        </div>
      </nav>

      <main className="main">
        <div className="container">
          {loading ? (
            <div className="video-grid">
              {[...Array(18)].map((_, i) => (
                <div key={i} className="skeleton-card" />
              ))}
            </div>
          ) : videos.length === 0 ? (
            <div className="empty">
              <div className="empty-icon">📁</div>
              <h2>No videos yet</h2>
              <p>Upload or download videos to get started</p>
            </div>
          ) : (
            <div className="video-grid">
              {videos
                .filter((v) => v.title.toLowerCase().includes(search.toLowerCase()))
                .map((video) => (
                <VideoCard key={video.id} video={video} onClick={() => openModal(video)} />
              ))}
            </div>
          )}
        </div>
      </main>

      {selectedVideo && (
        <div className={`modal-overlay ${modalVisible ? 'visible' : ''}`} onClick={closeModal}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">{selectedVideo.title}</div>
            <div className="modal-player">
              <video ref={videoRef} playsInline>
                <source src={`/api/stream/${selectedVideo.id}`} type="video/mp4" />
              </video>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;

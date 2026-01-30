import { useState, useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { Search } from "lucide-react";
import Plyr from "plyr";
import "plyr/dist/plyr.css";
import "./App.css";

function App() {
  const [videos, setVideos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedVideo, setSelectedVideo] = useState(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [search, setSearch] = useState("");
  const videoRef = useRef(null);
  const playerRef = useRef(null);

  const openModal = (video) => {
    setSelectedVideo(video);
    setTimeout(() => setModalVisible(true), 10);
  };

  const closeModal = () => {
    setModalVisible(false);
    setTimeout(() => {
      if (playerRef.current) {
        playerRef.current.destroy();
        playerRef.current = null;
      }
      setSelectedVideo(null);
    }, 300);
  };

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
                <div key={video.id} className="video-card" onClick={() => openModal(video)}>
                  <div className="video-thumbnail">
                    {video.thumbnail ? (
                      <img src={video.thumbnail} alt={video.title} />
                    ) : (
                      <div className="video-placeholder"></div>
                    )}
                    {video.duration && <div className="video-duration">{video.duration}</div>}
                  </div>
                  <div className="video-info">
                    <h3 className="video-title">{video.title}</h3>
                    <p className="video-meta">{video.size || "Unknown size"}</p>
                  </div>
                </div>
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

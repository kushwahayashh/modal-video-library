import { useState, useEffect } from "react";
import "./App.css";

function App() {
  const [videos, setVideos] = useState([]);
  const [loading, setLoading] = useState(true);

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
          <div className="nav-links">
            <a href="/">Library</a>
            <a href="/downloads">Downloads</a>
          </div>
          <div className="nav-right">
            <button className="nav-btn" onClick={() => window.open('/terminal', '_blank')}>
              Terminal
            </button>
            <button className="nav-btn">Upload</button>
          </div>
        </div>
      </nav>

      <main className="main">
        <div className="container">
          {loading ? (
            <div className="loading">Loading videos...</div>
          ) : videos.length === 0 ? (
            <div className="empty">
              <div className="empty-icon">📁</div>
              <h2>No videos yet</h2>
              <p>Upload or download videos to get started</p>
            </div>
          ) : (
            <div className="video-grid">
              {videos.map((video) => (
                <div key={video.id} className="video-card">
                  <div className="video-thumbnail">
                    {video.thumbnail ? (
                      <img src={video.thumbnail} alt={video.title} />
                    ) : (
                      <div className="video-placeholder">▶</div>
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
    </div>
  );
}

export default App;

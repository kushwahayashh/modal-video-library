import "./VideoCard.css";
import { useEffect, useState, type MouseEvent as ReactMouseEvent } from "react";
import type { Video } from "../../types";

interface VideoCardProps {
  video: Video;
  onClick: () => void;
  onContextMenu: (e: ReactMouseEvent, video: Video) => void;
  thumbnailOverrides: Record<string, string>;
  watchProgress?: { currentTime: number; duration: number };
}

export default function VideoCard({
  video,
  onClick,
  onContextMenu,
  thumbnailOverrides,
  watchProgress,
}: VideoCardProps) {
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);

  // Server is the single source of truth: scan persists a thumbnail per video.
  const imgSrc = thumbnailOverrides[video.id] || video.thumbnail || null;

  useEffect(() => {
    setImageLoaded(false);
    setImageFailed(false);
  }, [imgSrc]);

  const handleContextMenu = (e: ReactMouseEvent) => {
    e.preventDefault();
    onContextMenu(e, video);
  };

  return (
    <div className="video-card" onClick={onClick} onContextMenu={handleContextMenu}>
      <div className="video-thumbnail">
        <div className="video-placeholder skeleton"></div>
        {imgSrc && !imageFailed && (
          <img
            src={imgSrc}
            alt=""
            loading="lazy"
            className={`video-thumb-img ${imageLoaded ? "loaded" : ""}`}
            onLoad={() => setImageLoaded(true)}
            onError={() => setImageFailed(true)}
          />
        )}
        {video.duration && <div className="video-duration">{video.duration}</div>}
        {watchProgress && watchProgress.duration > 0 && (
          <div className="video-watch-progress">
            <div
              className="video-watch-progress-fill"
              style={{ width: `${Math.min(100, (watchProgress.currentTime / watchProgress.duration) * 100)}%` }}
            />
          </div>
        )}
      </div>
      <div className="video-info">
        <h3 className="video-title">{video.title}</h3>
        <p className="video-meta">
          <span>{video.size || "Unknown size"}</span>
          {video.hasSprites && <span className="video-sprite-tag">SPRITE</span>}
        </p>
      </div>
    </div>
  );
}

import "./VideoCard.css";
import { useEffect, useState, type MouseEvent as ReactMouseEvent } from "react";
import type { Video } from "../../types";
import { getStablePlaceholder } from "./helpers";

interface VideoCardProps {
  video: Video;
  onClick: () => void;
  onContextMenu: (e: ReactMouseEvent, video: Video) => void;
  placeholderImages: string[];
  thumbnailOverrides: Record<string, string>;
  watchProgress?: { currentTime: number; duration: number };
}

export default function VideoCard({
  video,
  onClick,
  onContextMenu,
  placeholderImages,
  thumbnailOverrides,
  watchProgress,
}: VideoCardProps) {
  const [imageLoaded, setImageLoaded] = useState(false);

  const stablePlaceholderKey =
    `${video.addedAt || video.createdAt || ""}|${video.sizeBytes || 0}|${video.duration || ""}`;
  const fallbackPlaceholder = getStablePlaceholder(stablePlaceholderKey, placeholderImages);
  const imgSrc = thumbnailOverrides[video.id] || video.thumbnail || fallbackPlaceholder;

  useEffect(() => {
    setImageLoaded(false);
  }, [imgSrc]);

  const handleContextMenu = (e: ReactMouseEvent) => {
    e.preventDefault();
    onContextMenu(e, video);
  };

  return (
    <div className="video-card" onClick={onClick} onContextMenu={handleContextMenu}>
      <div className="video-thumbnail">
        <div className="video-placeholder skeleton"></div>
        {imgSrc && (
          <img
            src={imgSrc}
            alt=""
            loading="lazy"
            className={`video-thumb-img ${imageLoaded ? "loaded" : ""}`}
            onLoad={() => setImageLoaded(true)}
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
        <p className="video-meta">{video.size || "Unknown size"}</p>
      </div>
    </div>
  );
}

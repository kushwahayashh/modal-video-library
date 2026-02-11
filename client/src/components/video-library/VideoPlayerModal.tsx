import type { RefObject } from "react";
import { Check } from "lucide-react";
import type { Video } from "../../types";

interface VideoPlayerModalProps {
  selectedVideo: Video | null;
  modalVisible: boolean;
  videoRef: RefObject<HTMLVideoElement>;
  onClose: () => void;
}

export default function VideoPlayerModal({
  selectedVideo,
  modalVisible,
  videoRef,
  onClose,
}: VideoPlayerModalProps) {
  if (!selectedVideo) return null;

  return (
    <div className={`modal-overlay ${modalVisible ? "visible" : ""}`} onClick={onClose}>
      <div className="modal-box" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <span>{selectedVideo.title}</span>
          {selectedVideo.hasSprites && (
            <span className="sprite-badge">
              <Check size={14} />
              Sprite Available
            </span>
          )}
        </div>
        <div className="modal-player">
          <video ref={videoRef} playsInline>
            <source src={`/api/stream/${selectedVideo.id}`} type="video/mp4" />
          </video>
        </div>
      </div>
    </div>
  );
}

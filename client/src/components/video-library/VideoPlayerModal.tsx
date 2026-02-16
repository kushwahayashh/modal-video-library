import { useId, useRef, type RefObject } from "react";
import { Check } from "lucide-react";
import type { Video } from "../../types";
import { useDialogFocusTrap } from "../../hooks/useDialogFocusTrap";

interface VideoPlayerModalProps {
  selectedVideo: Video | null;
  modalVisible: boolean;
  videoRef: RefObject<HTMLVideoElement | null>;
  onClose: () => void;
}

export default function VideoPlayerModal({
  selectedVideo,
  modalVisible,
  videoRef,
  onClose,
}: VideoPlayerModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useDialogFocusTrap({ active: modalVisible && !!selectedVideo, containerRef: dialogRef });
  if (!selectedVideo) return null;

  return (
    <div className={`modal-overlay ${modalVisible ? "visible" : ""}`} onClick={onClose}>
      <div
        ref={dialogRef}
        className="modal-box"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <span id={titleId}>{selectedVideo.title}</span>
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

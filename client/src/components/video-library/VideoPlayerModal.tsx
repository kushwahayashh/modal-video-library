import "./VideoPlayerModal.css";
import { useId, useRef } from "react";
import { IconCircleCheckFilled } from "@tabler/icons-react";
import type { Video } from "../../types";
import { useDialogFocusTrap } from "../../hooks/useDialogFocusTrap";
import CustomVideoPlayer from "./CustomVideoPlayer";

interface VideoPlayerModalProps {
  selectedVideo: Video | null;
  modalVisible: boolean;
  onClose: () => void;
}

export default function VideoPlayerModal({
  selectedVideo,
  modalVisible,
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
              <IconCircleCheckFilled size={14} />
              Sprite Available
            </span>
          )}
        </div>
        <div className="modal-player">
          <CustomVideoPlayer videoId={selectedVideo.id} hasSprites={selectedVideo.hasSprites} />
        </div>
      </div>
    </div>
  );
}

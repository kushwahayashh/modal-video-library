import "./VideoActionModal.css";
import { useId, useMemo, useRef, type KeyboardEvent as ReactKeyboardEvent } from "react";
import type { Video } from "../../types";
import { formatBytes, formatDate } from "../../utils";
import ThumbnailBrowserModal from "./ThumbnailBrowserModal";
import { useDialogFocusTrap } from "../../hooks/useDialogFocusTrap";
import type { ActionModalType, VideoProperties } from "./types";

interface VideoActionModalProps {
  actionModal: ActionModalType;
  closing: boolean;
  actionVideo: Video | null;
  actionLoading: boolean;
  renameValue: string;
  onRenameValueChange: (value: string) => void;
  onClose: () => void;
  onClosed: () => void;
  onRenameKeyDown: (e: ReactKeyboardEvent<HTMLInputElement>) => void;
  onConfirmRename: () => void;
  onConfirmDelete: () => void;
  videoProps: VideoProperties | null;
  hasVideoDetails: boolean;
  hasAudioDetails: boolean;
  placeholderImages: string[];
  placeholdersLoading: boolean;
  selectedThumbnail?: string;
  onThumbnailSelect: (image: string) => void;
  onPlaceholderImagesAdded?: (newUrls: string[]) => void;
  onPlaceholderImageDeleted?: (url: string) => void;
}

interface SummaryItem {
  label: string;
  value: string;
}

interface DetailItem {
  label: string;
  value: string;
}

export default function VideoActionModal({
  actionModal,
  closing,
  actionVideo,
  actionLoading,
  renameValue,
  onRenameValueChange,
  onClose,
  onClosed,
  onRenameKeyDown,
  onConfirmRename,
  onConfirmDelete,
  videoProps,
  hasVideoDetails,
  hasAudioDetails,
  placeholderImages,
  placeholdersLoading,
  selectedThumbnail,
  onThumbnailSelect,
  onPlaceholderImagesAdded,
  onPlaceholderImageDeleted,
}: VideoActionModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const trapActive = !!actionModal && !closing;
  useDialogFocusTrap({ active: trapActive, containerRef: dialogRef });

  const dialogTitle = useMemo(() => {
    if (actionModal === "rename") return "Rename Video";
    if (actionModal === "delete") return "Delete Video";
    if (actionModal === "thumbnail") return "Change Thumbnail";
    if (actionModal === "properties") return "Properties";
    return "Video Action";
  }, [actionModal]);

  if ((!actionModal || !actionVideo) && !closing) return null;
  if (!actionVideo) return null;

  // Thumbnail picker renders as a fullscreen overlay, not a centered modal
  if (actionModal === "thumbnail") {
    return (
      <ThumbnailBrowserModal
        open={true}
        closing={closing}
        placeholderImages={placeholderImages}
        placeholdersLoading={placeholdersLoading}
        selectedThumbnail={selectedThumbnail}
        onSelect={onThumbnailSelect}
        onClose={onClose}
        onClosed={onClosed}
        onPlaceholderImagesAdded={onPlaceholderImagesAdded}
        onPlaceholderImageDeleted={onPlaceholderImageDeleted}
      />
    );
  }

  const summaryItems: SummaryItem[] = [
    {
      label: "Size",
      value: videoProps?.sizeBytes ? formatBytes(videoProps.sizeBytes) : actionVideo.size || "—",
    },
    {
      label: "Duration",
      value: videoProps?.duration || actionVideo.duration || "—",
    },
    {
      label: "Container",
      value: videoProps?.container || "—",
    },
    {
      label: "Bitrate",
      value: videoProps?.totalBitrate || "—",
    },
  ];

  const videoDetails: DetailItem[] = [
    videoProps?.resolution ? { label: "Resolution", value: videoProps.resolution } : null,
    videoProps?.videoCodec ? { label: "Codec", value: videoProps.videoCodec.toUpperCase() } : null,
    videoProps?.framerate ? { label: "Framerate", value: videoProps.framerate } : null,
    videoProps?.videoBitrate ? { label: "Video bitrate", value: videoProps.videoBitrate } : null,
    videoProps?.pixelFormat ? { label: "Pixel format", value: videoProps.pixelFormat } : null,
  ].filter(Boolean) as DetailItem[];

  const audioDetails: DetailItem[] = [
    videoProps?.audioCodec ? { label: "Codec", value: videoProps.audioCodec.toUpperCase() } : null,
    videoProps?.audioChannels ? { label: "Channels", value: videoProps.audioChannels } : null,
    videoProps?.sampleRate ? { label: "Sample rate", value: videoProps.sampleRate } : null,
    videoProps?.audioBitrate ? { label: "Audio bitrate", value: videoProps.audioBitrate } : null,
  ].filter(Boolean) as DetailItem[];
  const hasStreamDetails = hasVideoDetails || hasAudioDetails;

  const modalClassName = `action-modal ${
    actionModal === "rename"
      ? "rename-modal"
      : actionModal === "properties"
        ? "properties-modal"
        : ""
  }`;
  const normalizedTitle = actionVideo.title.trim().toLowerCase();
  const normalizedFilename = actionVideo.filename.trim().toLowerCase();
  const filenameWithoutExtension = normalizedFilename.replace(/\.[^/.]+$/, "");
  const shouldShowFilename = Boolean(
    actionVideo.filename &&
    normalizedFilename !== normalizedTitle &&
    filenameWithoutExtension !== normalizedTitle
  );

  return (
    <div
      className={`action-modal-overlay${closing ? " closing" : ""}`}
      onClick={onClose}
      onAnimationEnd={(e) => {
        if (closing && e.animationName === "actionModalFadeOut" && e.target === e.currentTarget) {
          onClosed();
        }
      }}
    >
      <div
        ref={dialogRef}
        className={modalClassName}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        {actionModal === "rename" && (
          <>
            <div id={titleId} className="action-modal-title">{dialogTitle}</div>
            <input
              className="action-modal-input"
              value={renameValue}
              onChange={(e) => onRenameValueChange(e.target.value)}
              onKeyDown={onRenameKeyDown}
              autoFocus
              spellCheck={false}
              placeholder="Enter new name"
            />
            <div className="action-modal-actions">
              <button type="button" className="action-btn secondary" onClick={onClose}>Cancel</button>
              <button type="button" className="action-btn primary" onClick={onConfirmRename} disabled={actionLoading}>
                {actionLoading ? "Renaming..." : "Rename"}
              </button>
            </div>
          </>
        )}

        {actionModal === "delete" && (
          <>
            <div id={titleId} className="action-modal-title">{dialogTitle}</div>
            <div className="action-modal-message">
              Are you sure you want to delete <strong>"{actionVideo.title}"</strong>?
              <br />
              <span className="text-muted">This action cannot be undone.</span>
            </div>
            <div className="action-modal-actions">
              <button type="button" className="action-btn secondary" onClick={onClose}>Cancel</button>
              <button type="button" className="action-btn danger" onClick={onConfirmDelete} disabled={actionLoading}>
                {actionLoading ? "Deleting..." : "Delete"}
              </button>
            </div>
          </>
        )}

        {actionModal === "properties" && (
          <>
            <div className="prop-header">
              <div id={titleId} className="prop-label">{dialogTitle}</div>
              <div className="prop-title">{actionVideo.title}</div>
              {shouldShowFilename && (
                <div className="prop-filename">{actionVideo.filename}</div>
              )}
            </div>
            <div className="prop-body">
              {!videoProps ? (
                <div className="prop-loading">Loading properties...</div>
              ) : (
                <div className="prop-content">
                  <section className="prop-section">
                    <div className="prop-section-title">Overview</div>
                    {summaryItems.map((item) => (
                      <div key={item.label} className="prop-row">
                        <span className="prop-row-label">{item.label}</span>
                        <span className="prop-row-value">{item.value}</span>
                      </div>
                    ))}
                  </section>

                  {hasStreamDetails ? (
                    <div className="prop-columns">
                      {videoDetails.length > 0 && (
                        <section className="prop-section">
                          <div className="prop-section-title">Video</div>
                          {videoDetails.map((item) => (
                            <div key={`video-${item.label}`} className="prop-row">
                              <span className="prop-row-label">{item.label}</span>
                              <span className="prop-row-value">{item.value}</span>
                            </div>
                          ))}
                        </section>
                      )}
                      {audioDetails.length > 0 && (
                        <section className="prop-section">
                          <div className="prop-section-title">Audio</div>
                          {audioDetails.map((item) => (
                            <div key={`audio-${item.label}`} className="prop-row">
                              <span className="prop-row-label">{item.label}</span>
                              <span className="prop-row-value">{item.value}</span>
                            </div>
                          ))}
                        </section>
                      )}
                    </div>
                  ) : (
                    <div className="prop-empty">No stream details available.</div>
                  )}

                  <section className="prop-section">
                    <div className="prop-section-title">Timeline</div>
                    <div className="prop-meta-row">
                      <span className="prop-row-label">Created</span>
                      <span className="prop-row-value">{formatDate(videoProps.createdAt || actionVideo.createdAt)}</span>
                    </div>
                    {videoProps.modifiedAt && (
                      <div className="prop-meta-row">
                        <span className="prop-row-label">Modified</span>
                        <span className="prop-row-value">{formatDate(videoProps.modifiedAt)}</span>
                      </div>
                    )}
                  </section>
                </div>
              )}
            </div>
            <div className="action-modal-actions">
              <button type="button" className="action-btn primary" onClick={onClose}>Close</button>
            </div>
          </>
        )}


      </div>
    </div>
  );
}

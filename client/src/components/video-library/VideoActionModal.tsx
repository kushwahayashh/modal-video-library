import { X } from "lucide-react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import type { Video } from "../../types";
import { formatBytes, formatDate } from "../../utils";
import ThumbnailPicker from "../ThumbnailPicker";
import type { ActionModalType, VideoProperties } from "./types";

interface VideoActionModalProps {
  actionModal: ActionModalType;
  actionVideo: Video | null;
  actionLoading: boolean;
  renameValue: string;
  onRenameValueChange: (value: string) => void;
  onClose: () => void;
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
}

interface SummaryItem {
  label: string;
  value: string;
}

interface DetailItem {
  label: string;
  value: string;
  asPill?: boolean;
}

function DetailSection({ title, items }: { title: string; items: DetailItem[] }) {
  if (items.length === 0) return null;

  return (
    <div className="prop-section">
      <div className="prop-section-title">{title}</div>
      <div className="prop-kv">
        {items.map((item) => (
          <div key={`${title}-${item.label}`} className="prop-kv-row">
            <span className="prop-kv-label">{item.label}</span>
            {item.asPill ? (
              <span className="prop-pill">{item.value}</span>
            ) : (
              <span className="prop-kv-value">{item.value}</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function ModalHeader({ onClose }: { onClose: () => void }) {
  return (
    <button className="action-modal-close" onClick={onClose}>
      <X size={20} />
    </button>
  );
}

export default function VideoActionModal({
  actionModal,
  actionVideo,
  actionLoading,
  renameValue,
  onRenameValueChange,
  onClose,
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
}: VideoActionModalProps) {
  if (!actionModal || !actionVideo) return null;

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
    videoProps?.videoCodec ? { label: "Codec", value: videoProps.videoCodec.toUpperCase(), asPill: true } : null,
    videoProps?.framerate ? { label: "Framerate", value: videoProps.framerate } : null,
    videoProps?.videoBitrate ? { label: "Video bitrate", value: videoProps.videoBitrate } : null,
    videoProps?.pixelFormat ? { label: "Pixel format", value: videoProps.pixelFormat } : null,
  ].filter(Boolean) as DetailItem[];

  const audioDetails: DetailItem[] = [
    videoProps?.audioCodec ? { label: "Codec", value: videoProps.audioCodec.toUpperCase(), asPill: true } : null,
    videoProps?.audioChannels ? { label: "Channels", value: videoProps.audioChannels } : null,
    videoProps?.sampleRate ? { label: "Sample rate", value: videoProps.sampleRate } : null,
    videoProps?.audioBitrate ? { label: "Audio bitrate", value: videoProps.audioBitrate } : null,
  ].filter(Boolean) as DetailItem[];

  const modalClassName = `action-modal ${
    actionModal === "thumbnail" ? "thumbnail-modal" : actionModal === "properties" ? "properties-modal" : ""
  }`;

  return (
    <div className="action-modal-overlay" onClick={onClose}>
      <div className={modalClassName} onClick={(e) => e.stopPropagation()}>
        <ModalHeader onClose={onClose} />

        {actionModal === "rename" && (
          <>
            <div className="action-modal-title">Rename Video</div>
            <input
              className="action-modal-input"
              value={renameValue}
              onChange={(e) => onRenameValueChange(e.target.value)}
              onKeyDown={onRenameKeyDown}
              autoFocus
              placeholder="Enter new name"
            />
            <div className="action-modal-actions">
              <button className="action-btn secondary" onClick={onClose}>Cancel</button>
              <button className="action-btn primary" onClick={onConfirmRename} disabled={actionLoading}>
                {actionLoading ? "Renaming..." : "Rename"}
              </button>
            </div>
          </>
        )}

        {actionModal === "delete" && (
          <>
            <div className="action-modal-title">Delete Video</div>
            <div className="action-modal-message">
              Are you sure you want to delete <strong>"{actionVideo.title}"</strong>?
              <br />
              <span className="text-muted">This action cannot be undone.</span>
            </div>
            <div className="action-modal-actions">
              <button className="action-btn secondary" onClick={onClose}>Cancel</button>
              <button className="action-btn danger" onClick={onConfirmDelete} disabled={actionLoading}>
                {actionLoading ? "Deleting..." : "Delete"}
              </button>
            </div>
          </>
        )}

        {actionModal === "properties" && (
          <>
            <div className="prop-header">
              <div className="prop-label">Properties</div>
              <div className="prop-title">{actionVideo.title}</div>
              <div className="prop-filename">{actionVideo.filename}</div>
            </div>
            <div className="prop-body">
              {!videoProps ? (
                <div className="prop-skeleton">
                  <div className="prop-summary-skel">
                    <div className="prop-skel-block" />
                    <div className="prop-skel-block" />
                    <div className="prop-skel-block" />
                    <div className="prop-skel-block" />
                  </div>
                  <div className="prop-section-skel-grid">
                    <div className="prop-section-skel" />
                    <div className="prop-section-skel" />
                  </div>
                  <div className="prop-meta-skel" />
                </div>
              ) : (
                <div className="prop-content">
                  <div className="prop-summary">
                    {summaryItems.map((item) => (
                      <div key={item.label} className="prop-summary-item">
                        <span className="prop-summary-label">{item.label}</span>
                        <span className="prop-summary-value">{item.value}</span>
                      </div>
                    ))}
                  </div>

                  {(hasVideoDetails || hasAudioDetails) ? (
                    <div className="prop-sections">
                      <DetailSection title="Video" items={videoDetails} />
                      <DetailSection title="Audio" items={audioDetails} />
                    </div>
                  ) : (
                    <div className="prop-empty">No stream details available.</div>
                  )}

                  <div className="prop-meta">
                    <div className="prop-meta-row">
                      <span className="prop-meta-label">Created</span>
                      <span className="prop-meta-value">{formatDate(videoProps.createdAt || actionVideo.createdAt)}</span>
                    </div>
                    {videoProps.modifiedAt && (
                      <div className="prop-meta-row">
                        <span className="prop-meta-label">Modified</span>
                        <span className="prop-meta-value">{formatDate(videoProps.modifiedAt)}</span>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
            <div className="action-modal-actions">
              <button className="action-btn primary" onClick={onClose}>Close</button>
            </div>
          </>
        )}

        {actionModal === "thumbnail" && (
          <>
            <div className="action-modal-title">Change Thumbnail</div>
            <ThumbnailPicker
              images={placeholderImages}
              loading={placeholdersLoading}
              selectedImage={selectedThumbnail}
              onSelect={onThumbnailSelect}
            />
            <div className="action-modal-actions">
              <button className="action-btn secondary" onClick={onClose}>Cancel</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

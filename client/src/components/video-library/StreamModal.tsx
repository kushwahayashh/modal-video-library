import "./VideoPlayerModal.css";
import "./StreamModal.css";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { IconPlayerPlayFilled, IconLink } from "@tabler/icons-react";
import { useDialogFocusTrap } from "../../hooks/useDialogFocusTrap";
import CustomVideoPlayer from "./CustomVideoPlayer";

interface StreamModalProps {
  open: boolean;
  visible: boolean;
  onClose: () => void;
}

function isLikelyValidUrl(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  try {
    const url = new URL(trimmed, window.location.origin);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export default function StreamModal({ open, visible, onClose }: StreamModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [url, setUrl] = useState("");
  const [streamSrc, setStreamSrc] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useDialogFocusTrap({ active: visible && open, containerRef: dialogRef });

  // Reset transient state whenever the modal is fully closed.
  useEffect(() => {
    if (!open) {
      setUrl("");
      setStreamSrc(null);
      setError(null);
    }
  }, [open]);

  if (!open) return null;

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = url.trim();
    if (!isLikelyValidUrl(trimmed)) {
      setError("Enter a valid http(s) video URL");
      return;
    }
    setError(null);
    setStreamSrc(trimmed);
  };

  const clearStream = () => {
    setStreamSrc(null);
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  return (
    <div className={`modal-overlay ${visible ? "visible" : ""}`} onClick={onClose}>
      <div
        ref={dialogRef}
        className="modal-box stream-modal-box"
        role="dialog"
        aria-modal="true"
        aria-label="Stream from URL"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        <form className="stream-form" onSubmit={handleSubmit}>
          <div className="stream-input-wrap">
            <IconLink size={18} className="stream-input-icon" aria-hidden="true" />
            <input
              ref={inputRef}
              type="url"
              inputMode="url"
              autoComplete="off"
              spellCheck={false}
              className="stream-input"
              placeholder="https://example.com/video.mp4"
              value={url}
              onChange={(e) => {
                setUrl(e.target.value);
                if (error) setError(null);
              }}
              aria-invalid={!!error}
            />
          </div>
          <button type="submit" className="stream-play-btn" disabled={!url.trim()}>
            <IconPlayerPlayFilled size={16} />
            Play
          </button>
        </form>

        {error && <div className="stream-error" role="alert">{error}</div>}

        {streamSrc ? (
          <div className="modal-player">
            <CustomVideoPlayer key={streamSrc} streamSrc={streamSrc} />
          </div>
        ) : (
          <div className="stream-placeholder">
            <IconLink size={40} aria-hidden="true" />
            <p>Paste a direct video link (.mp4, .webm, .m3u8…) and press Play.</p>
          </div>
        )}

        {streamSrc && (
          <div className="stream-footer">
            <span className="stream-current-url" title={streamSrc}>{streamSrc}</span>
            <button type="button" className="stream-change-btn" onClick={clearStream}>
              Change URL
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

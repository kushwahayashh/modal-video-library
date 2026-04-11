import "../video-library/VideoActionModal.css";
import { useRef, useState, useId } from "react";
import { IconUpload } from "@tabler/icons-react";
import ThumbnailPicker from "../ThumbnailPicker";
import { useDialogFocusTrap } from "../../hooks/useDialogFocusTrap";
import { toast } from "sonner";

interface ThumbnailBrowserModalProps {
  open: boolean;
  closing: boolean;
  placeholderImages: string[];
  placeholdersLoading: boolean;
  selectedThumbnail?: string;
  onSelect?: (image: string) => void;
  onClose: () => void;
  onClosed: () => void;
  onPlaceholderImagesAdded?: (newUrls: string[]) => void;
  onPlaceholderImageDeleted?: (url: string) => void;
}

export default function ThumbnailBrowserModal({
  open,
  closing,
  placeholderImages,
  placeholdersLoading,
  selectedThumbnail,
  onSelect,
  onClose,
  onClosed,
  onPlaceholderImagesAdded,
  onPlaceholderImageDeleted,
}: ThumbnailBrowserModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const titleId = useId();

  useDialogFocusTrap({ active: open && !closing, containerRef: dialogRef });

  if (!open && !closing) return null;

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setUploading(true);
    try {
      const formData = new FormData();
      for (let i = 0; i < files.length; i++) {
        formData.append("files", files[i]);
      }

      const res = await fetch("/api/placeholder-images/upload", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Upload failed" }));
        throw new Error(err.error || "Upload failed");
      }

      const data = await res.json();
      if (Array.isArray(data.uploaded) && data.uploaded.length > 0) {
        onPlaceholderImagesAdded?.(data.uploaded);
        toast.success(`Uploaded ${data.uploaded.length} image${data.uploaded.length > 1 ? "s" : ""}`);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleDelete = async (imageUrl: string) => {
    // Extract filename from URL like /api/placeholder-images/foo.jpg
    const filename = decodeURIComponent(imageUrl.split("/").pop() || "");
    if (!filename) return;

    try {
      const res = await fetch(`/api/placeholder-images/${encodeURIComponent(filename)}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Delete failed" }));
        throw new Error(err.error || "Delete failed");
      }
      onPlaceholderImageDeleted?.(imageUrl);
      toast.success("Thumbnail deleted");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed");
    }
  };

  return (
    <div
      className={`thumbnail-fullscreen-overlay${closing ? " closing" : ""}`}
      onAnimationEnd={(e) => {
        if (closing && e.animationName === "thumbnailFadeOut" && e.target === e.currentTarget) {
          onClosed();
        }
      }}
    >
      <div
        ref={dialogRef}
        className="thumbnail-fullscreen"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
      >
        <div className="thumbnail-fullscreen-header">
          <div id={titleId} className="thumbnail-fullscreen-title">Thumbnails</div>
          <div className="thumbnail-fullscreen-header-actions">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              multiple
              hidden
              onChange={handleFileChange}
            />
            <button
              type="button"
              className="action-btn secondary thumbnail-upload-btn"
              onClick={handleUploadClick}
              disabled={uploading}
            >
              <IconUpload size={20} stroke={2.5} />
              {uploading ? "Uploading…" : "Upload"}
            </button>
            <button type="button" className="action-btn secondary" onClick={onClose}>Cancel</button>
          </div>
        </div>
        <div className="thumbnail-fullscreen-body">
          <ThumbnailPicker
            images={placeholderImages}
            loading={placeholdersLoading}
            selectedImage={selectedThumbnail}
            onSelect={onSelect || (() => {})}
            onDelete={handleDelete}
          />
        </div>
      </div>
    </div>
  );
}

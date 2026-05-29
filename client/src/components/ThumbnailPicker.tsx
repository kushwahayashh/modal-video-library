import { useEffect, useState } from "react";

interface ThumbnailPickerProps {
  images: string[];
  loading: boolean;
  selectedImage?: string;
  onSelect: (imageUrl: string) => void;
  onDelete?: (imageUrl: string) => void;
}

type ThumbnailStatus = "loaded" | "error";

function ThumbnailPicker({ images, loading, selectedImage, onSelect, onDelete }: ThumbnailPickerProps) {
  const [thumbnailStatusByImage, setThumbnailStatusByImage] = useState<
    Record<string, ThumbnailStatus>
  >({});

  // Only reset status for images that were removed, keep status for existing ones
  useEffect(() => {
    setThumbnailStatusByImage((prev) => {
      const currentSet = new Set(images);
      const next: Record<string, ThumbnailStatus> = {};
      for (const img of images) {
        if (prev[img]) next[img] = prev[img];
      }
      // Only update if something actually changed
      const prevKeys = Object.keys(prev);
      if (prevKeys.length === Object.keys(next).length && prevKeys.every((k) => currentSet.has(k))) {
        return prev;
      }
      return next;
    });
  }, [images]);

  return (
    <div className={`thumbnail-picker-grid ${loading ? "loading" : ""}`}>
      {loading && [...Array(9)].map((_, i) => (
        <div key={`thumbnail-skeleton-${i}`} className="thumbnail-picker-item skeleton" />
      ))}

      {!loading && images.length === 0 && (
        <div className="thumbnail-picker-empty">No thumbnail images available.</div>
      )}

      {!loading && images.map((img) => {
        const status = thumbnailStatusByImage[img];
        const loaded = status === "loaded";
        const failed = status === "error";

        return (
          <div key={img} className="thumbnail-picker-wrapper">
            <button
              className={`thumbnail-picker-item ${selectedImage === img ? "active" : ""} ${loaded ? "loaded" : ""} ${failed ? "error" : ""}`}
              disabled={failed}
              onClick={() => onSelect(img)}
            >
              {!loaded && !failed && <div className="thumbnail-picker-skeleton" />}
              {!failed && (
                <img
                  src={img}
                  alt=""
                  loading="lazy"
                  onLoad={() => {
                    setThumbnailStatusByImage((prev) => {
                      if (prev[img] === "loaded") return prev;
                      return { ...prev, [img]: "loaded" };
                    });
                  }}
                  onError={() => {
                    setThumbnailStatusByImage((prev) => {
                      if (prev[img] === "error") return prev;
                      return { ...prev, [img]: "error" };
                    });
                  }}
                />
              )}
              {failed && (
                <span className="thumbnail-picker-fallback">Unavailable</span>
              )}
            </button>
            {onDelete && (
              <button
                className="thumbnail-picker-delete"
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(img);
                }}
                title="Delete thumbnail"
              >
                Delete
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}

export default ThumbnailPicker;

import { useEffect, useState } from "react";

interface ThumbnailPickerProps {
  images: string[];
  loading: boolean;
  selectedImage?: string;
  onSelect: (imageUrl: string) => void;
}

function ThumbnailPicker({ images, loading, selectedImage, onSelect }: ThumbnailPickerProps) {
  const [thumbnailLoadState, setThumbnailLoadState] = useState<Record<string, boolean>>({});

  useEffect(() => {
    setThumbnailLoadState({});
  }, [images]);

  return (
    <div className={`thumbnail-picker-grid ${loading ? "loading" : ""}`}>
      {loading && [...Array(9)].map((_, i) => (
        <div key={`thumbnail-skeleton-${i}`} className="thumbnail-picker-item skeleton" />
      ))}

      {!loading && images.length === 0 && (
        <div className="thumbnail-picker-empty">No thumbnail images available.</div>
      )}

      {!loading && images.map((img) => (
        <button
          key={img}
          className={`thumbnail-picker-item ${selectedImage === img ? "active" : ""} ${thumbnailLoadState[img] ? "loaded" : ""}`}
          onClick={() => onSelect(img)}
        >
          {!thumbnailLoadState[img] && <div className="thumbnail-picker-skeleton" />}
          <img
            src={img}
            alt=""
            loading="lazy"
            onLoad={() => {
              setThumbnailLoadState((prev) => {
                if (prev[img]) return prev;
                return { ...prev, [img]: true };
              });
            }}
            onError={() => {
              setThumbnailLoadState((prev) => {
                if (prev[img]) return prev;
                return { ...prev, [img]: true };
              });
            }}
          />
        </button>
      ))}
    </div>
  );
}

export default ThumbnailPicker;

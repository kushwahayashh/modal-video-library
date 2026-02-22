import { useEffect, useState } from "react";

interface ThumbnailPickerProps {
  images: string[];
  loading: boolean;
  selectedImage?: string;
  onSelect: (imageUrl: string) => void;
}

type ThumbnailStatus = "loaded" | "error";

function ThumbnailPicker({ images, loading, selectedImage, onSelect }: ThumbnailPickerProps) {
  const [thumbnailStatusByImage, setThumbnailStatusByImage] = useState<
    Record<string, ThumbnailStatus>
  >({});

  useEffect(() => {
    setThumbnailStatusByImage({});
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
          <button
            key={img}
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
        );
      })}
    </div>
  );
}

export default ThumbnailPicker;

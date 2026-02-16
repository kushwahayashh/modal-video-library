import { useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";
import type { Video } from "../../types";
import VideoCard from "./VideoCard";

interface VirtualizedVideoGridProps {
  videos: Video[];
  onVideoClick: (video: Video) => void;
  onVideoContextMenu: (e: ReactMouseEvent, video: Video) => void;
  placeholderImages: string[];
  thumbnailOverrides: Record<string, string>;
  hasMore: boolean;
  loadingMore: boolean;
  onLoadMore: () => void;
}

const GRID_GAP = 20;
const CARD_MIN_WIDTH = 320;
const OVERSCAN_ROWS = 3;

function getWindowScrollY() {
  return typeof window === "undefined" ? 0 : window.scrollY;
}

function getWindowHeight() {
  return typeof window === "undefined" ? 0 : window.innerHeight;
}

export default function VirtualizedVideoGrid({
  videos,
  onVideoClick,
  onVideoContextMenu,
  placeholderImages,
  thumbnailOverrides,
  hasMore,
  loadingMore,
  onLoadMore,
}: VirtualizedVideoGridProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const [scrollY, setScrollY] = useState(getWindowScrollY);
  const [viewportHeight, setViewportHeight] = useState(getWindowHeight);

  useEffect(() => {
    if (!containerRef.current) return;

    const updateWidth = () => {
      if (!containerRef.current) return;
      setContainerWidth(containerRef.current.clientWidth);
    };

    updateWidth();
    const observer = new ResizeObserver(updateWidth);
    observer.observe(containerRef.current);

    return () => {
      observer.disconnect();
    };
  }, []);

  useEffect(() => {
    let rafId: number | null = null;

    const handleScroll = () => {
      if (rafId !== null) return;
      rafId = window.requestAnimationFrame(() => {
        setScrollY(window.scrollY);
        rafId = null;
      });
    };

    const handleResize = () => {
      setViewportHeight(window.innerHeight);
      if (containerRef.current) {
        setContainerWidth(containerRef.current.clientWidth);
      }
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    window.addEventListener("resize", handleResize);

    return () => {
      if (rafId !== null) {
        window.cancelAnimationFrame(rafId);
      }
      window.removeEventListener("scroll", handleScroll);
      window.removeEventListener("resize", handleResize);
    };
  }, []);

  const columnCount = useMemo(() => {
    if (containerWidth <= 0) return 1;
    return Math.max(1, Math.floor((containerWidth + GRID_GAP) / (CARD_MIN_WIDTH + GRID_GAP)));
  }, [containerWidth]);

  const cardWidth = useMemo(() => {
    if (containerWidth <= 0) return CARD_MIN_WIDTH;
    const totalGap = GRID_GAP * (columnCount - 1);
    return Math.max(200, (containerWidth - totalGap) / columnCount);
  }, [containerWidth, columnCount]);

  const rowHeight = useMemo(() => {
    const thumbHeight = cardWidth * (9 / 16);
    return Math.ceil(thumbHeight + 96);
  }, [cardWidth]);

  const rowStride = rowHeight + GRID_GAP;
  const rowCount = Math.ceil(videos.length / columnCount);
  const totalHeight = rowCount === 0 ? 0 : rowCount * rowStride - GRID_GAP;
  const containerTop = containerRef.current
    ? containerRef.current.getBoundingClientRect().top + scrollY
    : 0;

  const visibleItems = useMemo(() => {
    if (videos.length === 0 || rowCount === 0) return [];

    const viewportTop = scrollY;
    const viewportBottom = scrollY + viewportHeight;
    const rawStart = Math.floor((viewportTop - containerTop) / rowStride) - OVERSCAN_ROWS;
    const rawEnd = Math.ceil((viewportBottom - containerTop) / rowStride) + OVERSCAN_ROWS;
    const startRow = Math.max(0, Math.min(rowCount - 1, rawStart));
    const endRow = Math.max(0, Math.min(rowCount - 1, rawEnd));
    const items: Array<{ video: Video; row: number; col: number }> = [];

    for (let row = startRow; row <= endRow; row += 1) {
      for (let col = 0; col < columnCount; col += 1) {
        const index = row * columnCount + col;
        const video = videos[index];
        if (!video) break;
        items.push({ video, row, col });
      }
    }

    return items;
  }, [videos, rowCount, rowStride, columnCount, scrollY, viewportHeight, containerTop]);

  useEffect(() => {
    if (!hasMore || loadingMore || videos.length === 0) return;
    const viewportBottom = scrollY + viewportHeight;
    const contentBottom = containerTop + totalHeight;
    if (viewportBottom + 800 >= contentBottom) {
      onLoadMore();
    }
  }, [hasMore, loadingMore, videos.length, scrollY, viewportHeight, containerTop, totalHeight, onLoadMore]);

  return (
    <div ref={containerRef} className="video-grid-virtual">
      <div className="video-grid-virtual-inner" style={{ height: totalHeight }}>
        {visibleItems.map(({ video, row, col }) => (
          <div
            key={video.id}
            className="video-grid-virtual-item"
            style={{
              width: cardWidth,
              top: row * rowStride,
              left: col * (cardWidth + GRID_GAP),
            }}
          >
            <VideoCard
              video={video}
              onClick={() => onVideoClick(video)}
              onContextMenu={onVideoContextMenu}
              placeholderImages={placeholderImages}
              thumbnailOverrides={thumbnailOverrides}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

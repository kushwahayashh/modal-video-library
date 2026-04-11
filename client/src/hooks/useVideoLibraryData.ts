import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { Video } from "../types";
import { saveThumbnailToServer } from "../components/video-library/helpers";

interface UseVideoLibraryDataOptions {
  onThumbnailSaveError?: (message: string) => void;
  searchQuery?: string;
  pageSize?: number;
}

interface UseVideoLibraryDataResult {
  videos: Video[];
  setVideos: Dispatch<SetStateAction<Video[]>>;
  loading: boolean;
  loadingMore: boolean;
  hasMore: boolean;
  videosError: string | null;
  placeholderImages: string[];
  placeholdersLoading: boolean;
  thumbnailOverrides: Record<string, string>;
  setThumbnailOverrides: Dispatch<SetStateAction<Record<string, string>>>;
  fetchVideos: () => Promise<void>;
  loadMoreVideos: () => Promise<void>;
  updateThumbnailOverride: (videoId: string, imageUrl: string) => Promise<void>;
  addPlaceholderImages: (newUrls: string[]) => void;
  removePlaceholderImage: (url: string) => void;
}

const DEFAULT_PAGE_SIZE = 60;

export function useVideoLibraryData({
  onThumbnailSaveError,
  searchQuery = "",
  pageSize = DEFAULT_PAGE_SIZE,
}: UseVideoLibraryDataOptions = {}): UseVideoLibraryDataResult {
  const [videos, setVideos] = useState<Video[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [videosError, setVideosError] = useState<string | null>(null);
  const [placeholderImages, setPlaceholderImages] = useState<string[]>([]);
  const [placeholdersLoading, setPlaceholdersLoading] = useState(true);
  const [thumbnailOverrides, setThumbnailOverrides] = useState<Record<string, string>>({});
  const offsetRef = useRef(0);
  const requestIdRef = useRef(0);
  const normalizedQuery = useMemo(() => searchQuery.trim(), [searchQuery]);

  const fetchVideosPage = useCallback(async (reset: boolean) => {
    const currentOffset = reset ? 0 : offsetRef.current;
    const requestId = ++requestIdRef.current;
    if (reset) {
      setLoading(true);
      setLoadingMore(false);
    } else {
      setLoadingMore(true);
    }

    try {
      const params = new URLSearchParams();
      params.set("offset", String(currentOffset));
      params.set("limit", String(pageSize));
      if (normalizedQuery) params.set("q", normalizedQuery);

      const res = await fetch(`/api/videos?${params.toString()}`);
      if (!res.ok) {
        throw new Error(`Failed to load videos (${res.status})`);
      }

      const payload: unknown = await res.json();
      const pageVideos =
        payload &&
        typeof payload === "object" &&
        "videos" in payload &&
        Array.isArray((payload as { videos?: unknown }).videos)
          ? (payload as { videos: Video[] }).videos
          : null;

      if (!pageVideos) {
        throw new Error("Invalid videos response");
      }
      if (requestId !== requestIdRef.current) return;

      const total =
        payload &&
        typeof payload === "object" &&
        "total" in payload &&
        Number.isFinite((payload as { total?: unknown }).total)
          ? Number((payload as { total: number }).total)
          : null;

      const payloadNextOffset =
        payload &&
        typeof payload === "object" &&
        "nextOffset" in payload &&
        Number.isFinite((payload as { nextOffset?: unknown }).nextOffset)
          ? Number((payload as { nextOffset: number }).nextOffset)
          : currentOffset + pageVideos.length;

      const payloadHasMore =
        payload &&
        typeof payload === "object" &&
        "hasMore" in payload &&
        typeof (payload as { hasMore?: unknown }).hasMore === "boolean"
          ? (payload as { hasMore: boolean }).hasMore
          : total != null
            ? currentOffset + pageVideos.length < total
            : pageVideos.length === pageSize;

      offsetRef.current = payloadNextOffset;
      setHasMore(payloadHasMore);
      setVideos((prev) => {
        if (reset) return pageVideos;
        const seen = new Set(prev.map((video) => video.id));
        const appended = pageVideos.filter((video) => !seen.has(video.id));
        if (appended.length === 0) return prev;
        return [...prev, ...appended];
      });
      setVideosError(null);
    } catch (e) {
      if (requestId !== requestIdRef.current) return;
      setVideosError(e instanceof Error ? e.message : "Failed to load videos");
    } finally {
      if (requestId !== requestIdRef.current) return;
      setLoading(false);
      setLoadingMore(false);
    }
  }, [normalizedQuery, pageSize]);

  const fetchVideos = useCallback(async () => {
    offsetRef.current = 0;
    setHasMore(true);
    await fetchVideosPage(true);
  }, [fetchVideosPage]);

  const loadMoreVideos = useCallback(async () => {
    if (loading || loadingMore || !hasMore) return;
    await fetchVideosPage(false);
  }, [fetchVideosPage, hasMore, loading, loadingMore]);

  const updateThumbnailOverride = useCallback(
    async (videoId: string, imageUrl: string) => {
      setThumbnailOverrides((prev) => ({ ...prev, [videoId]: imageUrl }));
      try {
        await saveThumbnailToServer(videoId, imageUrl);
      } catch (e) {
        onThumbnailSaveError?.(e instanceof Error ? e.message : "Failed to save thumbnail");
      }
    },
    [onThumbnailSaveError]
  );

  useEffect(() => {
    let active = true;
    Promise.all([
      fetch("/api/placeholder-images").then((r) => (r.ok ? r.json() : { images: [] })),
      fetch("/api/thumbnail-map").then((r) => (r.ok ? r.json() : {})),
    ])
      .then(([imgData, mapData]) => {
        if (!active) return;
        if (Array.isArray(imgData?.images)) setPlaceholderImages(imgData.images);
        if (mapData && typeof mapData === "object" && !Array.isArray(mapData)) {
          setThumbnailOverrides(mapData as Record<string, string>);
        }
      })
      .catch(() => {
        if (active) setPlaceholderImages([]);
      })
      .finally(() => {
        if (active) setPlaceholdersLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    offsetRef.current = 0;
    setHasMore(true);
    void fetchVideosPage(true);
  }, [fetchVideosPage, normalizedQuery]);

  const addPlaceholderImages = useCallback((newUrls: string[]) => {
    setPlaceholderImages((prev) => {
      const existing = new Set(prev);
      const toAdd = newUrls.filter((url) => !existing.has(url));
      if (toAdd.length === 0) return prev;
      return [...toAdd, ...prev];
    });
  }, []);

  const removePlaceholderImage = useCallback((url: string) => {
    setPlaceholderImages((prev) => {
      const next = prev.filter((u) => u !== url);
      if (next.length === prev.length) return prev;
      return next;
    });

    // Also scrub from local overrides state so UI immediately removes the dead assignment
    setThumbnailOverrides((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const [vid, overrideUrl] of Object.entries(next)) {
        if (overrideUrl === url) {
          delete next[vid];
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, []);

  return {
    videos,
    setVideos,
    loading,
    loadingMore,
    hasMore,
    videosError,
    placeholderImages,
    placeholdersLoading,
    thumbnailOverrides,
    setThumbnailOverrides,
    fetchVideos,
    loadMoreVideos,
    updateThumbnailOverride,
    addPlaceholderImages,
    removePlaceholderImage,
  };
}

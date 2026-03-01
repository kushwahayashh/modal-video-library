import { useCallback, type Dispatch, type KeyboardEvent as ReactKeyboardEvent, type SetStateAction } from "react";
import type { Video } from "../types";

interface UseVideoActionsOptions {
  actionVideo: Video | null;
  renameValue: string;
  setVideos: Dispatch<SetStateAction<Video[]>>;
  setSelectedVideo: Dispatch<SetStateAction<Video | null>>;
  setThumbnailOverrides: Dispatch<SetStateAction<Record<string, string>>>;
  setActionLoading: (loading: boolean) => void;
  closeActionModal: () => void;
  pushToast: (message: string, variant?: "error" | "success") => void;
}

function getApiErrorMessage(payload: unknown, fallback: string) {
  if (
    payload &&
    typeof payload === "object" &&
    "error" in payload &&
    typeof (payload as { error?: unknown }).error === "string" &&
    (payload as { error: string }).error.trim()
  ) {
    return (payload as { error: string }).error.trim();
  }
  return fallback;
}

export function useVideoActions({
  actionVideo,
  renameValue,
  setVideos,
  setSelectedVideo,
  setThumbnailOverrides,
  setActionLoading,
  closeActionModal,
  pushToast,
}: UseVideoActionsOptions) {
  const confirmRename = useCallback(async () => {
    if (!renameValue.trim() || !actionVideo) return;
    setActionLoading(true);
    try {
      const trimmedName = renameValue.trim();
      const res = await fetch(`/api/videos/${actionVideo.id}/rename`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newName: trimmedName }),
      });
      let payload: unknown = null;
      try {
        payload = await res.json();
      } catch {
        payload = null;
      }
      if (!res.ok) {
        throw new Error(getApiErrorMessage(payload, "Failed to rename"));
      }
      let newVideoId = actionVideo.id;
      if (
        payload &&
        typeof payload === "object" &&
        "id" in payload &&
        typeof (payload as { id?: unknown }).id === "string" &&
        (payload as { id: string }).id.trim()
      ) {
        newVideoId = (payload as { id: string }).id.trim();
      }
      let newFilename = actionVideo.filename;
      if (
        payload &&
        typeof payload === "object" &&
        "filename" in payload &&
        typeof (payload as { filename?: unknown }).filename === "string" &&
        (payload as { filename: string }).filename.trim()
      ) {
        newFilename = (payload as { filename: string }).filename.trim();
      }
      if (newVideoId !== actionVideo.id) {
        setThumbnailOverrides((prev) => {
          const currentThumb = prev[actionVideo.id];
          if (!currentThumb) return prev;
          if (prev[newVideoId] === currentThumb) return prev;
          return { ...prev, [newVideoId]: currentThumb };
        });
      }
      setVideos((prev) =>
        prev.map((videoItem) => {
          if (videoItem.id !== actionVideo.id) return videoItem;
          return {
            ...videoItem,
            id: newVideoId,
            filename: newFilename,
            title: trimmedName,
          };
        })
      );
      setSelectedVideo((prev) => {
        if (!prev || prev.id !== actionVideo.id) return prev;
        return {
          ...prev,
          id: newVideoId,
          filename: newFilename,
          title: trimmedName,
        };
      });
      pushToast(`Renamed: ${actionVideo.title}`, "success");
      closeActionModal();
    } catch (e) {
      pushToast(e instanceof Error ? e.message : "Failed to rename");
    } finally {
      setActionLoading(false);
    }
  }, [renameValue, actionVideo, pushToast, setVideos, setSelectedVideo, setThumbnailOverrides, setActionLoading, closeActionModal]);

  const confirmDelete = useCallback(async () => {
    if (!actionVideo) return;
    setActionLoading(true);
    try {
      const res = await fetch(`/api/videos/${actionVideo.id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to delete");
      setVideos((prev) => prev.filter((videoItem) => videoItem.id !== actionVideo.id));
      setThumbnailOverrides((prev) => {
        if (!(actionVideo.id in prev)) return prev;
        const next = { ...prev };
        delete next[actionVideo.id];
        return next;
      });
      pushToast(`Deleted: ${actionVideo.title}`, "success");
      closeActionModal();
    } catch {
      pushToast("Failed to delete video");
    } finally {
      setActionLoading(false);
    }
  }, [actionVideo, pushToast, setVideos, setThumbnailOverrides, setActionLoading, closeActionModal]);

  const generateSprites = useCallback(async (video: Video) => {
    try {
      const res = await fetch(`/api/videos/${video.id}/sprites`, { method: "POST" });
      let payload: unknown = null;
      try {
        payload = await res.json();
      } catch {
        payload = null;
      }
      if (!res.ok) {
        throw new Error(getApiErrorMessage(payload, "Failed to generate sprites"));
      }
      pushToast(`Sprite generation started: ${video.title}`, "success");
    } catch (e) {
      pushToast(e instanceof Error ? e.message : "Failed to generate sprites");
    }
  }, [pushToast]);

  const handleRenameKeyDown = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") confirmRename();
    if (e.key === "Escape") closeActionModal();
  };

  return {
    confirmRename,
    confirmDelete,
    generateSprites,
    handleRenameKeyDown,
  };
}

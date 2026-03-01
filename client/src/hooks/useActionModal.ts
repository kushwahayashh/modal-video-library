import { useCallback, useState } from "react";
import type { Video } from "../types";
import type { ActionModalType, VideoProperties } from "../components/video-library/types";

export function useActionModal() {
  const [actionModal, setActionModal] = useState<ActionModalType>(null);
  const [actionModalClosing, setActionModalClosing] = useState(false);
  const [actionVideo, setActionVideo] = useState<Video | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [videoProps, setVideoProps] = useState<VideoProperties | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  const hasVideoDetails = !!(
    videoProps?.resolution ||
    videoProps?.videoCodec ||
    videoProps?.videoBitrate ||
    videoProps?.framerate ||
    videoProps?.pixelFormat
  );
  const hasAudioDetails = !!(
    videoProps?.audioCodec ||
    videoProps?.audioBitrate ||
    videoProps?.audioChannels ||
    videoProps?.sampleRate
  );

  const openActionModal = (type: ActionModalType, video: Video) => {
    setActionModalClosing(false);
    setActionVideo(video);
    setActionModal(type);
    if (type === "rename") {
      setRenameValue(video.title);
    } else if (type === "properties") {
      setVideoProps(null);
      fetch(`/api/videos/${video.id}`)
        .then((r) => {
          if (!r.ok) throw new Error("Failed to load properties");
          return r.json();
        })
        .then((data) => setVideoProps(data))
        .catch(() => setVideoProps(video));
    }
  };

  const closeActionModal = () => {
    if (!actionModal) return;
    setActionModalClosing(true);
  };

  const finalizeCloseActionModal = useCallback(() => {
    setActionModalClosing(false);
    setActionModal(null);
    setActionVideo(null);
    setRenameValue("");
    setVideoProps(null);
    setActionLoading(false);
  }, []);

  return {
    actionModal,
    actionModalClosing,
    actionVideo,
    renameValue,
    setRenameValue,
    videoProps,
    actionLoading,
    setActionLoading,
    hasVideoDetails,
    hasAudioDetails,
    openActionModal,
    closeActionModal,
    finalizeCloseActionModal,
  };
}

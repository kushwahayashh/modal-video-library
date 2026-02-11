import type { Video } from "../../types";

export interface ContextMenuState {
  visible: boolean;
  x: number;
  y: number;
  video: Video | null;
}

export type ActionModalType = "rename" | "delete" | "properties" | "thumbnail" | null;

export interface VideoProperties extends Video {
  modifiedAt?: string;
  resolution?: string;
  videoCodec?: string;
  videoBitrate?: string;
  framerate?: string;
  pixelFormat?: string;
  audioCodec?: string;
  audioBitrate?: string;
  audioChannels?: string;
  sampleRate?: string;
  container?: string;
  totalBitrate?: string;
}

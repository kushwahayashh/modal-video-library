export interface Video {
  id: string;
  title: string;
  filename: string;
  size: string;
  sizeBytes: number;
  createdAt: string;
  addedAt?: string;
  thumbnail: string | null;
  duration: string | null;
  hasSprites?: boolean;
  /** Signed token that makes this video's stream URL shareable without the password. */
  shareToken?: string;
}

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
}

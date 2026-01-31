export interface Video {
  id: string;
  title: string;
  filename: string;
  size: string;
  sizeBytes: number;
  createdAt: string;
  thumbnail: string | null;
  duration: string | null;
}

export interface FileItem {
  name: string;
  path: string;
  size: number;
  isFolder: boolean;
  modified: string;
}

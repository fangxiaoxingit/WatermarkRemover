export type Platform = "qianwen" | "doubao";
export interface Context {
  platform: Platform;
  conversationId: string;
}
export interface Asset extends Context {
  assetId: string;
  messageId: string;
  originalUrl: string;
  previewUrl?: string;
  width: number;
  height: number;
  source: string;
}
export interface Task {
  id: string;
  assets: Asset[];
  mode: "single" | "zip" | "individual";
  fileIndices?: number[];
  downloads?: Record<number, number>;
  savedIndices?: number[];
  createdAt: number;
  status: string;
  downloadId?: number;
  error?: string;
  ownerTab?: number;
  progress?: number;
  detail?: string;
  failedIndices?: number[];
}
export interface TaskProgress {
  id: string;
  platform?: Platform;
  conversationId?: string;
  status: string;
  progress: number;
  detail: string;
  retryable: boolean;
}

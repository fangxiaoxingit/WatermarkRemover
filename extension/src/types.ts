import type { Locale, LocalizedText } from "./i18n";
import type { TaskStatus } from "./task-status";
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
  status: TaskStatus;
  locale: Locale;
  downloadId?: number;
  error?: string;
  ownerTab?: number;
  progress?: number;
  detail?: string | LocalizedText;
  failedIndices?: number[];
}
export interface TaskProgress {
  id: string;
  platform?: Platform;
  conversationId?: string;
  status: TaskStatus;
  progress: number;
  detail: string | LocalizedText;
  retryable: boolean;
}

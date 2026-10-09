export const taskStatuses = {
  preparing: "准备中",
  fetching: "获取图片",
  packing: "打包中",
  saving: "浏览器保存中",
  completed: "已完成",
  partial: "部分失败",
  failed: "失败",
  cancelled: "已取消",
} as const;
export type TaskStatus = keyof typeof taskStatuses;

// Existing session tasks can survive a reload of the extension.
export function normalizeStatus(value: unknown): TaskStatus | undefined {
  if (typeof value !== "string") return;
  if (Object.hasOwn(taskStatuses, value)) return value as TaskStatus;
  return (Object.keys(taskStatuses) as TaskStatus[]).find(
    (key) => taskStatuses[key] === value,
  );
}
export function statusLabel(value: unknown): string {
  const status = normalizeStatus(value);
  return status ? taskStatuses[status] : "状态未知";
}
export function isActiveStatus(value: unknown): boolean {
  const status = normalizeStatus(value);
  return (
    status !== undefined &&
    ["preparing", "fetching", "packing", "saving"].includes(status)
  );
}

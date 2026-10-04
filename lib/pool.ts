/**
 * 并发控制工具
 * 用于把串行的批量异步请求改为受限并发，避免触发平台函数时限
 */

/** 默认并发上限，可用 STEAM_CONCURRENCY 覆盖。实测 16 未触发 Steam 限流 */
const configured = parseInt(
  (typeof process !== 'undefined' ? process.env.STEAM_CONCURRENCY : undefined) || '',
  10
);
export const DEFAULT_CONCURRENCY = Number.isInteger(configured) && configured > 0 ? configured : 16;

/**
 * 以受限并发的方式对数组逐项执行异步任务
 *
 * 语义约定：
 * - 最多同时执行 limit 个 fn，任务全部完成后再启动下一个
 * - 返回数组顺序与输入 items 顺序严格一致
 * - 单个 fn 抛错不会中断整体，该项结果为 undefined，其余项照常完成
 * - limit 小于 1 时回退为 DEFAULT_CONCURRENCY
 */
export async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number = DEFAULT_CONCURRENCY,
  fn: (item: T, index: number) => Promise<R>
): Promise<Array<R | undefined>> {
  const results: Array<R | undefined> = new Array(items.length);
  if (items.length === 0) {
    return results;
  }

  const concurrency = Number.isFinite(limit) && limit >= 1
    ? Math.min(Math.floor(limit), items.length)
    : DEFAULT_CONCURRENCY;

  let cursor = 0;

  const worker = async (): Promise<void> => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      try {
        results[index] = await fn(items[index], index);
      } catch {
        results[index] = undefined;
      }
    }
  };

  const workers: Promise<void>[] = [];
  for (let i = 0; i < concurrency; i++) {
    workers.push(worker());
  }
  await Promise.all(workers);

  return results;
}

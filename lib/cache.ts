import { CacheItem, CacheStore } from './types.js';

/**
 * 简单的内存缓存实现
 */
class MemoryCache {
  private store: CacheStore = {};
  private cleanupInterval: ReturnType<typeof setInterval> | null = null;

  constructor() {
    // 定期清理过期数据（每5分钟）
    if (typeof setInterval !== 'undefined') {
      this.cleanupInterval = setInterval(() => {
        this.cleanup();
      }, 5 * 60 * 1000);
    }
  }

  /**
   * 获取缓存
   */
  get<T>(key: string): T | null {
    const item = this.store[key];
    
    if (!item) {
      return null;
    }

    // 检查是否过期
    const now = Date.now();
    if (now - item.timestamp > item.ttl) {
      delete this.store[key];
      return null;
    }

    return item.data as T;
  }

  /**
   * 设置缓存
   */
  set<T>(key: string, data: T, ttlMs: number): void {
    this.store[key] = {
      data,
      timestamp: Date.now(),
      ttl: ttlMs,
    };
  }

  /**
   * 删除缓存
   */
  delete(key: string): void {
    delete this.store[key];
  }

  /**
   * 清空所有缓存
   */
  clear(): void {
    this.store = {};
  }

  /**
   * 获取缓存过期时间（ISO字符串）
   */
  getExpiry(key: string): string | null {
    const item = this.store[key];
    if (!item) {
      return null;
    }
    const expiryTime = new Date(item.timestamp + item.ttl);
    return expiryTime.toISOString();
  }

  /**
   * 清理过期缓存
   */
  private cleanup(): void {
    const now = Date.now();
    const expiredKeys: string[] = [];

    for (const [key, item] of Object.entries(this.store)) {
      if (now - item.timestamp > item.ttl) {
        expiredKeys.push(key);
      }
    }

    expiredKeys.forEach(key => {
      delete this.store[key];
    });
  }

  /**
   * 销毁缓存（清理定时器）
   */
  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    this.clear();
  }

  /**
   * 获取缓存统计信息
   */
  getStats() {
    return {
      itemCount: Object.keys(this.store).length,
    };
  }
}

// 全局缓存实例
export const cache = new MemoryCache();

/**
 * 获取 TTL（毫秒）
 */
export function getTTL(minutes: number): number {
  return minutes * 60 * 1000;
}

export function getTTLFromHours(hours: number): number {
  return hours * 60 * 60 * 1000;
}

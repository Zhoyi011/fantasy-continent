export class ObjectPool<T> {
  private freeList: T[] = [];
  private readonly factory: () => T;
  private readonly resetFn: (item: T) => void;
  private readonly maxSize: number;

  constructor(
    factory: () => T,
    resetFn: (item: T) => void,
    initialCount = 0,
    maxSize = 512
  ) {
    this.factory = factory;
    this.resetFn = resetFn;
    this.maxSize = maxSize;
    this.prewarm(initialCount);
  }

  public prewarm(count: number): void {
    const target = Math.min(count, this.maxSize);
    while (this.freeList.length < target) {
      const item = this.factory();
      this.resetFn(item);
      this.freeList.push(item);
    }
  }

  public acquire(): T {
    if (this.freeList.length > 0) {
      return this.freeList.pop()!;
    }
    return this.factory();
  }

  public release(item: T): void {
    this.resetFn(item);
    if (this.freeList.length < this.maxSize) {
      this.freeList.push(item);
    }
  }

  public releaseAll(list: T[]): void {
    for (let i = list.length - 1; i >= 0; i--) {
      this.release(list[i]);
    }
    list.length = 0;
  }

  public get pooledCount(): number {
    return this.freeList.length;
  }
}

/**
 * A ring buffer implementation for efficient data handling.
 * This is useful for storing a fixed-size window of data points
 * without having to reallocate memory.
 */
export class RingBuffer<T> {
  private data: T[];
  private capacity: number;
  private index: number = 0;
  private isFull: boolean = false;

  /**
   * Create a new RingBuffer with the specified capacity.
   * @param capacity The maximum number of items the buffer can hold
   */
  constructor(capacity: number) {
    this.capacity = capacity;
    this.data = new Array<T>(capacity);
  }

  /**
   * Add an item to the buffer. If the buffer is full, the oldest item will be overwritten.
   * @param item The item to add
   */
  push(item: T): void {
    this.data[this.index] = item;
    this.index = (this.index + 1) % this.capacity;
    if (this.index === 0) {
      this.isFull = true;
    }
  }

  /**
   * Get all items in the buffer as an array.
   * @returns An array containing all items in the buffer, in the order they were added
   */
  toArray(): T[] {
    if (!this.isFull) {
      return this.data.slice(0, this.index);
    }
    // If the buffer is full, we need to return the items in the correct order
    return [...this.data.slice(this.index), ...this.data.slice(0, this.index)];
  }

  /**
   * Get the current number of items in the buffer.
   * @returns The number of items in the buffer
   */
  size(): number {
    return this.isFull ? this.capacity : this.index;
  }

  /**
   * Clear the buffer.
   */
  clear(): void {
    this.data = new Array<T>(this.capacity);
    this.index = 0;
    this.isFull = false;
  }

  /**
   * Check if the buffer is empty.
   * @returns True if the buffer is empty, false otherwise
   */
  isEmpty(): boolean {
    return this.index === 0 && !this.isFull;
  }

  /**
   * Check if the buffer is full.
   * @returns True if the buffer is full, false otherwise
   */
  isFilled(): boolean {
    return this.isFull;
  }
} 
/**
 * Mock for chokidar file watcher (ESM compatibility)
 */

import { EventEmitter } from 'events';

class MockFSWatcher extends EventEmitter {
  private closed = false;

  add(paths: string | string[]): this {
    return this;
  }

  unwatch(paths: string | string[]): this {
    return this;
  }

  getWatched(): Record<string, string[]> {
    return {};
  }

  close(): Promise<void> {
    this.closed = true;
    return Promise.resolve();
  }
}

export function watch(
  paths: string | string[],
  options?: any
): MockFSWatcher {
  const watcher = new MockFSWatcher();
  // Emit ready event asynchronously
  setImmediate(() => watcher.emit('ready'));
  return watcher;
}

export default { watch };

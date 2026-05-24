export interface PluginRegistry {
  // The host registry is generic over extension points; contributions are typed
  // at the call site (e.g. `satisfies PluginPanel`).
  contribute(point: string, value: unknown): void;
}

/**
 * Per-plugin async key/value store the host hands to `setup`. Reserved for
 * coaching memory in a later phase; the Stage-1 debrief does not use it.
 */
export interface PluginStore {
  get<T>(key: string): Promise<T | undefined>;
  set<T>(key: string, value: T): Promise<void>;
  delete(key: string): Promise<void>;
  getAll<T>(): Promise<Record<string, T>>;
  keys(): Promise<string[]>;
}

export interface PluginContext {
  registry: PluginRegistry;
  storage: PluginStore;
}

export interface DataViewerPlugin {
  id: string;
  name: string;
  version: string;
  priority: number;
  setup(ctx: PluginContext): void;
}

export interface PluginRegistry {
  // The host registry is generic over extension points; contributions are typed
  // at the call site (e.g. `satisfies PluginPanel`).
  contribute(point: string, value: unknown): void;
}

export interface PluginContext {
  registry: PluginRegistry;
}

export interface DataViewerPlugin {
  id: string;
  name: string;
  version: string;
  priority: number;
  setup(ctx: PluginContext): void;
}

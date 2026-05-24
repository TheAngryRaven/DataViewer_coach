export interface PluginRegistry {
  contribute(channel: string, value: string): void;
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

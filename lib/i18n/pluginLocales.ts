/**
 * Compile-time stub of the host's plugin-owned i18n seam (DataViewer
 * `src/lib/i18n/pluginLocales.ts`). At runtime the host's real module resolves
 * via the `@/` alias (which points at the host's `src/`), so this file's body
 * never executes in production — it exists only so the package typechecks and
 * tests standalone. Keep the exported surface matched to the host contract.
 *
 * Divergence from the host: the real module imports the i18next instance and
 * calls `i18n.addResourceBundle(...)`. There is no coach-side i18next bootstrap
 * (and the smoke test runs `plugin.setup()` in a bare node env), so this stub is
 * a side-effect-free recorder that just remembers what was registered.
 */

/** Lazy loader for one (namespace, language) plugin locale chunk. */
export type PluginLocaleLoader = () => Promise<{ default: Record<string, unknown> }>;

const loaders = new Map<string, Record<string, PluginLocaleLoader>>();
const englishBundles = new Map<string, Record<string, unknown>>();

/**
 * Register a plugin's own translation namespace. `en` is the always-present
 * source/fallback bundle; `otherLanguages` maps each non-English code to a
 * dynamic-import loader of that language's JSON in the plugin's folder.
 * Idempotent per namespace.
 */
export function registerPluginLocale(
  namespace: string,
  en: Record<string, unknown>,
  otherLanguages: Record<string, PluginLocaleLoader>,
): void {
  loaders.set(namespace, otherLanguages);
  englishBundles.set(namespace, en);
}

/** The lazy loader for a plugin namespace + language, if one is registered. */
export function getPluginLocaleLoader(
  namespace: string,
  language: string,
): PluginLocaleLoader | undefined {
  return loaders.get(namespace)?.[language];
}

/** Whether a namespace is owned by a plugin (so the backend routes it here). */
export function isPluginNamespace(namespace: string): boolean {
  return loaders.has(namespace);
}

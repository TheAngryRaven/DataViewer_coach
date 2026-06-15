// Plugin-local i18n for the AI Coach plugin. Translations live in ./locales/
// (this plugin lives in its own repo, so it owns its strings rather than using
// the host's src/locales/). English is bundled; other languages lazy-load from
// this folder via the host's registerPluginLocale seam. Keys are typed off the
// English JSON, so the plugin keeps compile-time key safety without touching the
// host's i18next type augmentation. Mirrors the host's Tools plugin (src/plugins/
// tools/i18n.ts).

import { useTranslation } from "react-i18next";
import { registerPluginLocale } from "@/lib/i18n/pluginLocales";
import en from "./locales/en.json";

export const COACH_NS = "coach";

// Dotted-key union derived from the English bundle (no plural suffixes in this
// namespace, so a straight flatten is exact).
type FlattenKeys<T, P extends string = ""> = {
  [K in keyof T & string]: T[K] extends string ? `${P}${K}` : FlattenKeys<T[K], `${P}${K}.`>;
}[keyof T & string];
export type CoachKey = FlattenKeys<typeof en>;

/** Register the Coach namespace with i18next. Called once from the plugin setup. */
export function registerCoachLocale(): void {
  registerPluginLocale(COACH_NS, en, {
    es: () => import("./locales/es.json"),
    fr: () => import("./locales/fr.json"),
    de: () => import("./locales/de.json"),
    it: () => import("./locales/it.json"),
    "pt-BR": () => import("./locales/pt-BR.json"),
    ja: () => import("./locales/ja.json"),
  });
}

/** Typed translator scoped to the Coach namespace. */
export function useCoachT(): (key: CoachKey, opts?: Record<string, unknown>) => string {
  const { t } = useTranslation(COACH_NS);
  // The declared return type narrows callers to typed CoachKeys; i18next's t is
  // directly assignable to it (no host type augmentation in this package).
  return t;
}

/** The active BCP-47 language tag, for locale-aware number formatting (see
 *  lib/i18n/format). Re-renders on language change like the translator does. */
export function useCoachLocale(): string {
  return useTranslation(COACH_NS).i18n.language;
}

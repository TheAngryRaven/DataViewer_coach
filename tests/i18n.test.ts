import { describe, it, expect } from "vitest";
import { missingKeys, extraKeys, placeholderMismatches, type LocaleTree } from "@/lib/i18n/seedUtils";
import { COACH_NS, registerCoachLocale } from "@/panel/i18n";
import { getPluginLocaleLoader, isPluginNamespace } from "@/lib/i18n/pluginLocales";

import en from "@/panel/locales/en.json";
import es from "@/panel/locales/es.json";
import fr from "@/panel/locales/fr.json";
import de from "@/panel/locales/de.json";
import itLocale from "@/panel/locales/it.json";
import ptBR from "@/panel/locales/pt-BR.json";
import ja from "@/panel/locales/ja.json";

// The Coach plugin owns its translations under panel/locales/. This mirrors the
// host's plugin locale-parity test (DovesDataViewer src/plugins/tools/i18n.test.ts):
// every shipped language must have exactly the English keys with placeholders
// preserved, so the namespace stays self-contained and extraction-ready.
const source: LocaleTree = en;
const nonEnglish: Record<string, LocaleTree> = {
  es,
  fr,
  de,
  it: itLocale,
  "pt-BR": ptBR,
  ja,
};

describe("coach plugin locale parity", () => {
  it("ships an English source bundle plus other languages", () => {
    expect(source).toBeDefined();
    expect(Object.keys(nonEnglish).length).toBeGreaterThan(0);
  });

  for (const [lng, tree] of Object.entries(nonEnglish)) {
    it(`${lng} has the same keys as en`, () => {
      expect(missingKeys(source, tree), `${lng} is missing keys`).toEqual([]);
      expect(extraKeys(source, tree), `${lng} has extra keys`).toEqual([]);
    });

    it(`${lng} preserves all placeholders/markup`, () => {
      expect(placeholderMismatches(source, tree)).toEqual([]);
    });
  }
});

describe("registerCoachLocale", () => {
  it("registers the coach namespace and its non-English loaders", () => {
    registerCoachLocale();
    expect(isPluginNamespace(COACH_NS)).toBe(true);
    for (const lng of Object.keys(nonEnglish)) {
      expect(getPluginLocaleLoader(COACH_NS, lng)).toBeTypeOf("function");
    }
  });
});

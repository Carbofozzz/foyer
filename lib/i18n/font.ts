import { Source_Serif_4 } from "next/font/google";

/** One face for all UI locales (Latin, Latin-ext, Cyrillic). */
export const serif = Source_Serif_4({
  subsets: ["latin", "latin-ext", "cyrillic"],
  display: "swap",
  adjustFontFallback: false,
});

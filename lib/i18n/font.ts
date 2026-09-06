import { Inter, Source_Serif_4 } from "next/font/google";

/** Display face: headings, lead paragraphs, charter and verdict text. */
export const serif = Source_Serif_4({
  subsets: ["latin", "latin-ext", "cyrillic"],
  display: "swap",
  adjustFontFallback: false,
  variable: "--font-serif",
});

/** UI face: controls, labels, chips, amounts. */
export const sans = Inter({
  subsets: ["latin", "latin-ext", "cyrillic"],
  display: "swap",
  adjustFontFallback: false,
  variable: "--font-sans",
});

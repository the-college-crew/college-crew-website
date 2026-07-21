/**
 * College Crew design tokens for iOS.
 *
 * HIG-native surfaces with the brand as accent: viridian (deep green) is the
 * single interactive tint, cream/paper are the surfaces, gold is reserved for
 * highlights on dark viridian surfaces (it fails contrast on cream, so it is
 * never used for text or tint on light backgrounds).
 *
 * One radius system app-wide: 12 for cards/inputs, pills for buttons.
 * Values mirror apps/web/app/globals.css (crew/quad/gold scales).
 */

export const color = {
  // surfaces
  paper: "#fffdf8",
  cream: "#f7f5f1",
  card: "#fcfbf8",
  line: "#d7d1c3",

  // text
  ink: "#344945",
  inkSoft: "#66736f",
  mist: "#89928f",

  // brand
  viridian: "#344945",
  viridianDeep: "#2b3a37",
  viridianInk: "#2a3a37",
  crew700: "#2f413d",
  crew500: "#596b66",
  crew100: "#f0eee6",

  // gold: dark-surface accent only (contrast fails on cream)
  gold: "#c5c27d",
  goldDeep: "#5f6535",
  goldStar: "#8a7a2a",

  // status/badge surfaces — mirror apps/web status-pill + badge tones so the
  // booking-state vocabulary reads identically to the website.
  honeydew: "#e4e3bc",
  sky: "#d5e3e8",
  stone: "#e0dcd1",
  amber: "#f2e7c6",
  amberInk: "#6b5411",

  // feedback
  danger: "#9a3b2e",
  dangerSoft: "#f4e6e2",
  success: "#3f6b4f",

  onViridian: "#fffdf8",
} as const;

export const radius = {
  card: 12,
  input: 12,
  pill: 999,
} as const;

export const space = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;

export const type = {
  // iOS system font (SF Pro) via default fontFamily; sizes follow HIG text styles
  largeTitle: { fontSize: 34, fontWeight: "700", letterSpacing: 0.2 },
  title1: { fontSize: 28, fontWeight: "700" },
  title2: { fontSize: 22, fontWeight: "600" },
  headline: { fontSize: 17, fontWeight: "600" },
  body: { fontSize: 17, fontWeight: "400" },
  subhead: { fontSize: 15, fontWeight: "400" },
  footnote: { fontSize: 13, fontWeight: "400" },
} as const;

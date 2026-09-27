/**
 * The Dracula token set (engineering spec §7.1): near-black ground, dark
 * surfaces, Dracula's accents, and pastel rather than saturated status
 * colours - a loss is coral, not #FF5555 (product spec §6.4).
 *
 * Dark only. Extends Neutral for everything not named here.
 *
 * This is the source. The app imports the built output next to it
 * (`dracula.js` + `dracula.css`), which is present on first paint; rebuild
 * after editing this file or upgrading Astryx:
 *
 *   npx @astryxdesign/cli theme build src/themes/dracula.theme.ts -o src/themes/dracula.css
 */

import { defineTheme } from "@astryxdesign/core/theme";
import { neutralIconRegistry, neutralTheme } from "@astryxdesign/theme-neutral";

export const draculaTheme = defineTheme({
  name: "dracula",
  extends: neutralTheme,
  // Named explicitly: the build only carries an icon registry it can see as
  // a named import, so an inherited one would be dropped from the output.
  icons: neutralIconRegistry,
  color: { accent: "#BD93F9", neutralStyle: "cool" },
  tokens: {
    // Ground and surfaces
    "--color-background-body": "#17171F",
    "--color-background-surface": "#21222C",
    "--color-background-card": "#21222C",
    "--color-background-popover": "#282A36",
    "--color-background-muted": "#1B1C24",
    "--color-border": "#2E3040",
    "--color-border-emphasized": "#44475A",
    "--color-overlay-hover": "#FFFFFF0F",
    "--color-overlay-pressed": "#FFFFFF1A",

    // Text and icons
    "--color-text-primary": "#F8F8F2",
    "--color-text-secondary": "#A4A9C9",
    "--color-text-disabled": "#6272A4",
    "--color-text-accent": "#BD93F9",
    "--color-icon-primary": "#F8F8F2",
    "--color-icon-secondary": "#A4A9C9",
    "--color-icon-disabled": "#6272A4",
    "--color-icon-accent": "#BD93F9",

    // Accent and status, pastel on a dark ground
    "--color-accent": "#BD93F9",
    "--color-on-accent": "#1A1726",
    "--color-success": "#50FA7B",
    "--color-success-muted": "#50FA7B26",
    "--color-on-success": "#10231A",
    "--color-error": "#FF8A8A",
    "--color-error-muted": "#FF8A8A26",
    "--color-on-error": "#2A1414",
    "--color-warning": "#F1FA8C",
    "--color-warning-muted": "#F1FA8C26",
    "--color-on-warning": "#23240F",

    // Shape. The large control height is shared by the top bar's chips and
    // its sign-in button, so they line up.
    "--size-element-lg": "40px",
    "--radius-inner": "6px",
    "--radius-element": "12px",
    "--radius-container": "16px",

    // Type: the families are loaded by next/font in the root layout
    "--font-family-body": "var(--font-sans), ui-sans-serif, system-ui, sans-serif",
    "--font-family-heading": "var(--font-sans), ui-sans-serif, system-ui, sans-serif",
    "--font-family-code": "var(--font-mono), ui-monospace, Menlo, monospace",
  },
  // Neutral colours some accent fills (the progress bar, the step
  // indicator) through its own token rather than --color-accent.
  localTokens: {
    "--astryx-theme-neutral-color-status-fill-accent": "#BD93F9",
  },
  components: {
    // Generated players have no photo, so the initials disc is what shows:
    // pastel, from the "lower" end of the hero palette, with dark ink.
    "avatar-fallback": {
      base: { backgroundColor: "#EFA6E4", color: "#1A1726" },
    },
    // Secondary actions are outlined on the dark ground rather than filled,
    // so the two hero buttons stay the only solid colour on the screen.
    button: {
      "variant:secondary": {
        backgroundColor: "#1E1F29",
        borderColor: "#3A3D4F",
        borderStyle: "solid",
        borderWidth: "1px",
        color: "#F8F8F2",
      },
    },
  },
});

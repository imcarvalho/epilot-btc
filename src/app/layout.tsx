import type { Metadata, Viewport } from "next";
import { JetBrains_Mono, Space_Grotesk } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";

// Self-hosted by next/font at build time; the Dracula theme reads them
// through these two variables (src/themes/dracula.theme.ts).
const sans = Space_Grotesk({ subsets: ["latin"], variable: "--font-sans", display: "swap" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono", display: "swap" });

export const metadata: Metadata = {
  title: "BTC Guess",
  description: "Guess whether BTC/USD will be higher or lower one minute from now.",
};

export const viewport: Viewport = {
  colorScheme: "dark",
  themeColor: "#17171F",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable}`}>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}

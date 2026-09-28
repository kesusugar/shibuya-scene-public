import type { Metadata } from "next";
import "./globals.css";

// The scene is entirely client-rendered and fetches its static assets in the
// browser, so it can be exported for GitHub Pages.
export const dynamic = "force-static";

// GitHub Pages serves this project below its repository name.
const favicon = ((import.meta as any).env?.BASE_URL ?? "/") + "favicon.svg";

export const metadata: Metadata = {
  title: "Shibuya Scene Reconstruction — Reference R1",
  description: "Shibuya rounded crowds, shared PBR materials and tiered render fidelity.",
  other: {
    "codex-preview": "development",
  },
  icons: {
    icon: favicon,
    shortcut: favicon,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <body className="antialiased">{children}</body>
    </html>
  );
}

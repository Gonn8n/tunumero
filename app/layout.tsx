import type { Metadata, Viewport } from "next";
import { ThemeProvider } from "next-themes";
import { Sora, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const sora = Sora({
  subsets: ["latin"],
  variable: "--font-sora",
  weight: ["400", "500", "600", "700", "800"],
  display: "swap"
});

const num = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-num",
  weight: ["500", "600", "700", "800"],
  display: "swap"
});

export const metadata: Metadata = {
  title: "Tunumero — Sorteo",
  description: "Elegí tu número favorito y participá del sorteo."
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#2563eb" },
    { media: "(prefers-color-scheme: dark)", color: "#040a17" }
  ]
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" suppressHydrationWarning>
      <body className={`${sora.variable} ${num.variable}`}>
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}

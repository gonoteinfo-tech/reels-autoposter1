import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Reels AutoPoster — Automação de Reels Instagram & Facebook",
  description:
    "Sistema automatizado para coletar, reprocessar com logo e republicar Reels no Instagram e Facebook.",
  icons: { icon: "/favicon.ico" },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR">
      <body className="antialiased">{children}</body>
    </html>
  );
}

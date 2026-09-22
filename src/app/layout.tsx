import type { Metadata } from "next";
import { Bricolage_Grotesque, IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google";
import "./globals.css";

/** Títulos */
const display = Bricolage_Grotesque({
  subsets: ["latin"],
  variable: "--font-display-family",
  display: "swap",
});

/** Texto corrido e interface */
const body = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-body-family",
  display: "swap",
});

/** Números, horários e códigos */
const mono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["500"],
  variable: "--font-mono-family",
  display: "swap",
});

export const metadata: Metadata = {
  title: "GO POST — Automação de Reels para Instagram e Facebook",
  description:
    "Acompanha perfis de referência, aplica a sua marca d'água, reescreve legendas com IA e publica Reels no Instagram e no Facebook.",
  icons: { icon: "/favicon.ico" },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR" className={`${display.variable} ${body.variable} ${mono.variable}`}>
      <body className="antialiased">{children}</body>
    </html>
  );
}

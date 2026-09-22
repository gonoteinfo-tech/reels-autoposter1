import type { Metadata } from "next";
// Fontes embutidas no projeto (pacotes @fontsource): o build não depende de baixar
// nada do Google — o next/font/google quebrava o build com Turbopack na VPS.
import "@fontsource-variable/bricolage-grotesque/index.css"; // títulos
import "@fontsource/ibm-plex-sans/latin-400.css"; // texto e interface
import "@fontsource/ibm-plex-sans/latin-500.css";
import "@fontsource/ibm-plex-sans/latin-600.css";
import "@fontsource/ibm-plex-mono/latin-500.css"; // números, horários e códigos
import "./globals.css";

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
    <html lang="pt-BR">
      <body className="antialiased">{children}</body>
    </html>
  );
}

import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Suspense } from "react";
import { Geist, Geist_Mono } from "next/font/google";
import Header, { HeaderFallback } from "@/components/Header";
import Footer from "@/components/Footer";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const TITULO = "Apuração 2026 — Lula × Flávio vs 2022 e 2018";
const DESCRICAO =
  "Apuração em tempo real da eleição presidencial de 2026 com dados do TSE, comparada com 2022 e 2018 por país, estado e município: Lula (≙ Haddad em 2018) e Flávio Bolsonaro (≙ Jair Bolsonaro).";

export const metadata: Metadata = {
  title: { default: TITULO, template: "%s · Apuração 2026" },
  description: DESCRICAO,
  applicationName: "Apuração 2026",
  openGraph: {
    title: TITULO,
    description: DESCRICAO,
    type: "website",
    locale: "pt_BR",
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f4f5f7" },
    { media: "(prefers-color-scheme: dark)", color: "#0b0f17" },
  ],
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="pt-BR" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col bg-bg text-fg">
        <a
          href="#conteudo"
          className="sr-only focus:not-sr-only focus:fixed focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-surface focus:px-3 focus:py-2"
        >
          Pular para o conteúdo
        </a>
        <Suspense fallback={<HeaderFallback />}>
          <Header />
        </Suspense>
        <main id="conteudo" className="mx-auto w-full max-w-7xl flex-1 px-3 py-4 sm:px-4 sm:py-6">
          {children}
        </main>
        <Footer />
      </body>
    </html>
  );
}

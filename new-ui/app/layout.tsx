import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Toaster } from "sonner";
import { ThemeProvider } from "./theme-provider";
import Providers from "./providers";
import "./globals.css";

const geist = Geist({
  subsets: ["latin"],
  variable: "--font-geist",
});

const geistMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-geist-mono",
});

export const metadata: Metadata = {
  title: "Legal RAG — Dashboard",
  description: "Legal & Compliance RAG Agent",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){var s=document.documentElement.getAttribute('data-theme')||localStorage.getItem('theme');var d=window.matchMedia('(prefers-color-scheme: dark)').matches;var dark=s==='dark'||(!s&&d);document.documentElement.classList.toggle('dark',dark);})();`,
          }}
        />
      </head>
      <body
        className={`${geist.variable} ${geistMono.variable} font-sans bg-white dark:bg-slate-950 text-slate-900 dark:text-white antialiased`}
      >
        <Providers>
          <ThemeProvider>
            {children}
            <Toaster theme="system" position="top-right" richColors closeButton />
          </ThemeProvider>
        </Providers>
      </body>
    </html>
  );
}
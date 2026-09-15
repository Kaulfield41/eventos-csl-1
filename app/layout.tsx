import type { Metadata } from "next";
import Link from "next/link";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Alborada · Setlists para forScore",
  description: "Genera setlists de forScore a partir de las fichas de eventos musicales.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="es"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <nav className="border-b px-6 py-3 flex gap-4 text-sm">
          <Link href="/" className="font-medium hover:underline">
            Setlist
          </Link>
          <Link href="/biblioteca" className="hover:underline">
            Biblioteca en la nube
          </Link>
          <Link href="/pendientes" className="hover:underline">
            Pendientes
          </Link>
          <Link href="/correo" className="hover:underline">
            Correo
          </Link>
          <Link href="/estadisticas" className="hover:underline">
            Estadísticas
          </Link>
        </nav>
        {children}
      </body>
    </html>
  );
}

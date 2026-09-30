import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Simulador Deportivo",
  description: "Gestiona, simula y mira en vivo: Fútbol, NFL y DC Comics.",
};
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#0b1220" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body className="min-h-screen bg-fondo font-sans antialiased">{children}</body>
    </html>
  );
}

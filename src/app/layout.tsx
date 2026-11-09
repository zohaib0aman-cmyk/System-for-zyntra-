import type { Metadata, Viewport } from "next";
import "./globals.css";
import { ServiceWorker } from "@/components/ServiceWorker";

export const metadata: Metadata = {
  title: { default: "Zyntra Lead ID", template: "%s · Zyntra Lead ID" },
  description: "Zyntra Lead ID System — track business leads.",
  robots: { index: false, follow: false },
  applicationName: "Zyntra Lead ID",
  appleWebApp: { capable: true, title: "Zyntra", statusBarStyle: "default" },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#4f46e5",
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-dvh">
        {children}
        <ServiceWorker />
      </body>
    </html>
  );
}

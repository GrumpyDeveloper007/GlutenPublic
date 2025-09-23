import type { Metadata } from "next";
import "./globals.css";
import 'leaflet/dist/leaflet.css'


export const metadata: Metadata = {
  title: "react-next-vibe-geo-json-editor",
  description: "made by AI",
  icons: {
    icon: '/favicon.ico',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        {/* head content */}
      </head>
      <body

      >
        {children}
      </body>
    </html>
  );
}

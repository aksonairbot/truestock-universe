import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Truestock Universe",
  description: "Internal MIS · marketing engine · task management",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="antialiased">
        <div className="relative z-10 min-h-screen">{children}</div>
      </body>
    </html>
  );
}

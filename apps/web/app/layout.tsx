import type { Metadata } from "next";
import Nav from "./nav";
import "./globals.css";

export const metadata: Metadata = {
  title: "Skynet · Truestock Universe",
  description: "Internal MIS · marketing engine · task management",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="antialiased">
        <div className="relative z-10 min-h-screen">
          <Nav />
          {children}
        </div>
      </body>
    </html>
  );
}

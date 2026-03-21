import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Agile Flow",
  description: "Workshop template for agentic development workflows",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

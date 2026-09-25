import type { Metadata } from "next";
import "./globals.css";
import Nav from "@/components/Nav";

export const metadata: Metadata = {
  title: "Fathom — AI meeting notetaker",
  description:
    "Records, transcribes and summarizes meetings: AI summaries, action items, highlights, search and shareable clips.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-[#0a0a0b] text-neutral-200 antialiased">
        <Nav />
        <div className="mx-auto w-full max-w-[1400px] px-4 sm:px-6">{children}</div>
      </body>
    </html>
  );
}

import type { Metadata } from "next";
import "./globals.css";
import Nav from "@/components/Nav";
import { getSessionUser } from "@/lib/auth";

export const metadata: Metadata = {
  title: "Fathom — AI meeting notetaker",
  description:
    "Records, transcribes and summarizes meetings: AI summaries, action items, highlights, search and shareable clips.",
};

export const dynamic = "force-dynamic";

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const user = await getSessionUser();

  return (
    <html lang="en">
      <body className="min-h-screen bg-[#0a0a0b] text-neutral-200 antialiased">
        <Nav user={user ? { name: user.name, email: user.email } : null} />
        <div className="mx-auto w-full max-w-[1400px] px-4 sm:px-6">{children}</div>
      </body>
    </html>
  );
}

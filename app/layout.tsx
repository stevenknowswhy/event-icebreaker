import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { headers } from "next/headers";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host =
    requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host");
  const protocol =
    requestHeaders.get("x-forwarded-proto") ??
    (host?.includes("localhost") ? "http" : "https");
  const origin = host ? `${protocol}://${host}` : "http://localhost:3000";

  return {
    title: "Event Icebreaker — Skip the small talk",
    description:
      "Share a selective conversation card by QR, with optional encrypted Deep Connect.",
    referrer: "no-referrer",
    icons: {
      icon: "/favicon.svg",
      shortcut: "/favicon.svg",
    },
    openGraph: {
      title: "Event Icebreaker",
      description: "Skip the small talk. Share the signal.",
      images: [
        {
          url: `${origin}/og.png`,
          width: 1736,
          height: 906,
          alt: "Event Icebreaker — Skip the small talk. Share the signal.",
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: "Event Icebreaker",
      description: "Skip the small talk. Share the signal.",
      images: [`${origin}/og.png`],
    },
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}

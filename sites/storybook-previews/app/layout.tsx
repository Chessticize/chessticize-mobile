import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host =
    requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host");
  const protocol = requestHeaders.get("x-forwarded-proto") ?? "https";
  const origin = host ? `${protocol}://${host}` : "http://localhost:3000";
  const socialImage = new URL("/og.png", origin).toString();

  return {
    title: "Chessticize Feedback Design Lab",
    description:
      "Review Storybook-only design directions for the latest Chessticize user feedback.",
    openGraph: {
      title: "Chessticize Feedback Design Lab",
      description: "Four interaction prototypes. Nine user-feedback issues. No product wiring yet.",
      images: [{ url: socialImage, width: 1200, height: 630 }],
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title: "Chessticize Feedback Design Lab",
      description: "Review the interaction before we wire the product.",
      images: [socialImage],
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
      <body>{children}</body>
    </html>
  );
}

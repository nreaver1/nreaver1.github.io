import type { Metadata } from "next";
import { Fraunces, Oswald } from "next/font/google";
import "./globals.css";
import Nav from "@/components/Nav";
import NavigationProvider from "@/components/NavigationProvider";

const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-fraunces",
  style: ["normal", "italic"],
  weight: ["400", "500", "600", "700"],
});

const oswald = Oswald({
  subsets: ["latin"],
  variable: "--font-oswald",
  weight: ["400", "500"],
});

export const metadata: Metadata = {
  title: "Clog Casino",
  description:
    "See exactly how spooned or dry you were for every item in your collection log.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    // data-scroll-behavior lets Next turn off the smooth scrolling in
    // globals.css during page navigations, so only in-page jumps glide.
    <html lang="en" data-scroll-behavior="smooth" className={`${fraunces.variable} ${oswald.variable}`}>
      <body className="min-h-screen bg-ink text-parchment font-serif antialiased">
        <NavigationProvider>
          <Nav />
          <main className="page-grid pb-24">{children}</main>
        </NavigationProvider>
      </body>
    </html>
  );
}

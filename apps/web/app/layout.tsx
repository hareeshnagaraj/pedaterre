import type { Metadata } from "next";
import { Barlow_Condensed, Libre_Franklin } from "next/font/google";
import "./globals.css";

const libre = Libre_Franklin({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-libre",
  display: "swap",
});

const barlow = Barlow_Condensed({
  subsets: ["latin"],
  weight: ["600", "700", "800"],
  variable: "--font-barlow",
  display: "swap",
});

export const metadata: Metadata = {
  title: "pedaterre · NYC tax block assessed value",
  description:
    "A schematic view of NYC tax block assessed market value from the Department of Finance final roll.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${libre.variable} ${barlow.variable}`}>{children}</body>
    </html>
  );
}

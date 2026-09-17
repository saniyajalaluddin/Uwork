import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "UWORK — Business Intelligence & Forecasting Platform",
  description: "Enterprise SaaS platform transforming raw business data into forecasts, intelligence, and decisions.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full">
      <body className="h-full antialiased text-slate-900 bg-slate-50 font-sans">
        {children}
      </body>
    </html>
  );
}


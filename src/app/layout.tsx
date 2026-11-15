import type { Metadata } from "next";
import "./globals.css";
import { Header } from "@/components/Header";

export const metadata: Metadata = {
  title: "Vibersey · Design your jersey with AI",
  description:
    "Chat with AI to design a custom baseball, basketball, football, hockey or soccer jersey. Printed and shipped on demand, for one player or the whole team.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen font-sans antialiased">
        <Header />
        {children}
      </body>
    </html>
  );
}

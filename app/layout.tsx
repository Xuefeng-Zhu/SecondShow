import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = { title: "SecondShow — Turn a first show into a second.", description: "Build a plan for your next show with cultural intelligence." };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="en"><body>{children}</body></html>; }

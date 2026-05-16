import type { ReactNode } from "react"
import "./globals.css"

export const metadata = {
  title: "Documents",
  description: "AI document workspace",
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ru">
      <body>{children}</body>
    </html>
  )
}

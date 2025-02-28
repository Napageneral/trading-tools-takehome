import './globals.css'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Timeseries Visualization',
  description: 'Interactive visualization of large timeseries data',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>
        <main className="min-h-screen bg-gray-50 dark:bg-gray-900">
          {children}
        </main>
      </body>
    </html>
  )
} 
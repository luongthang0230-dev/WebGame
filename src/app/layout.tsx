export const metadata = { title: 'Kiếm Hiệp Online', description: 'MMORPG 2D kiếm hiệp' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi">
      <body style={{ margin: 0, background: '#111', color: '#fff', fontFamily: 'sans-serif' }}>
        {children}
      </body>
    </html>
  );
}

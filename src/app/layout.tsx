import type { Metadata, Viewport } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'cheap mosday',
  description: '타이밍 맞춰 쳐내는 반응 게임',
};

export const viewport: Viewport = {
  themeColor: '#0a0a0a',
  // 연타 중 더블탭 확대가 걸리면 판정이 끊기므로 모바일에서 확대를 막는다.
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    /*
     * 일부 모바일 브라우저가 하이드레이션 전에 html/body 에 속성을 끼워 넣어
     * "attributes ... didn't match" 경고가 난다. 앱 안에는 기기에 따라 달라지는
     * 렌더 입력이 없으므로(모든 window 접근은 useEffect 안) 이 두 요소만 눈감아 준다.
     * 이 속성은 한 겹에만 적용돼서, 안쪽의 진짜 불일치는 그대로 보고된다.
     */
    <html
      lang="ko"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="flex min-h-full flex-col" suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}

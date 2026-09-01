import type {Metadata,Viewport} from 'next';
import './globals.css';
import AppShell from '../components/AppShell';

export const metadata:Metadata={
  title:'Settle — Expense Tracking & Settlement',
  description:'Record shared expenses, split bills fairly, and see exactly who owes whom.',
  manifest:'/manifest.json',
  icons:{icon:'/icons/icon-192.png',apple:'/icons/apple-touch-icon.png'},
};

export const viewport:Viewport={
  width:'device-width',
  initialScale:1,
  maximumScale:1,
  themeColor:'#15171a',
};

export default function RootLayout({children}:{children:React.ReactNode}){
  return (
    <html lang="en">
      <body>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}

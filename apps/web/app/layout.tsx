import type { Metadata } from 'next';
import './globals.css';
import { LanguageProvider } from '@/lib/use-language';
import { AuthProvider } from '@/lib/auth-context';
import { Navbar, MainContainer, Footer } from '@/components/Navbar';

export const metadata: Metadata = {
  title: 'SmartCareer — Evidence-Based Skill Assessment & Job Matching',
  description:
    'แพลตฟอร์มค้นหางาน ประเมินทักษะเชิงปฏิบัติ จับคู่ความต้องการของงาน และวางแผนพัฒนาทักษะ',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="th">
      <body className="min-h-screen flex flex-col bg-[#F2F4F8] text-slate-900 antialiased">
        <LanguageProvider>
          <AuthProvider>
            <Navbar />
            <MainContainer>{children}</MainContainer>
            <Footer />
          </AuthProvider>
        </LanguageProvider>
      </body>
    </html>
  );
}

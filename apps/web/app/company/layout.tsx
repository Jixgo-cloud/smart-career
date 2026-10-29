import RoleGuard from '@/components/RoleGuard';

export default function CompanyLayout({ children }: { children: React.ReactNode }) {
  return <RoleGuard role="COMPANY">{children}</RoleGuard>;
}

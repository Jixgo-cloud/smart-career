import RoleGuard from '@/components/RoleGuard';

export default function ApplicationsLayout({ children }: { children: React.ReactNode }) {
  return <RoleGuard role="CANDIDATE">{children}</RoleGuard>;
}

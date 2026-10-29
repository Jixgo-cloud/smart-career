import RoleGuard from '@/components/RoleGuard';

export default function LearningPlanLayout({ children }: { children: React.ReactNode }) {
  return <RoleGuard role="CANDIDATE">{children}</RoleGuard>;
}

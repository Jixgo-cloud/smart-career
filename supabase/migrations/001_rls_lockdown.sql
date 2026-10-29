-- Supabase / PostgreSQL Row Level Security Lockdown Migration
-- Blocks direct PostgREST access by anon/authenticated roles while allowing Prisma backend role full access.

DO $$
DECLARE
  tbl record;
BEGIN
  FOR tbl IN
    SELECT tablename
    FROM pg_tables
    WHERE schemaname = 'public'
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', tbl.tablename);
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon, authenticated;', tbl.tablename);
  END LOOP;
END
$$;

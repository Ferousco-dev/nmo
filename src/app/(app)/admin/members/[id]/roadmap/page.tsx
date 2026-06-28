import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { MemberRoadmapEditor } from '@/components/admin/MemberRoadmapEditor';

export const dynamic = 'force-dynamic';

interface Props {
  params: { id: string };
}

export default async function AdminMemberRoadmapPage({ params }: Props) {
  const supabase = createClient();

  // Member identity for the header
  const { data: member } = await supabase
    .from('profiles')
    .select('id, display_name, skool_handle, skool_display_name, email')
    .eq('id', params.id)
    .maybeSingle();

  if (!member) notFound();

  // Tasks via the SECURITY DEFINER admin RPC (middleware already
  // confirmed we're an admin to reach /admin/*).
  const { data: tasks } = await supabase.rpc('admin_list_user_tasks', {
    p_user_id: params.id,
  });

  const displayName =
    member.skool_display_name ||
    member.display_name ||
    (member.skool_handle ? `@${member.skool_handle}` : null) ||
    member.email ||
    'Member';

  return (
    <main className="mx-auto max-w-3xl px-4 sm:px-6 py-8">
      <Link
        href={`/admin/members/${params.id}`}
        className="inline-flex items-center gap-1.5 text-sm text-ink-muted hover:text-ink mb-5"
      >
        <ChevronLeft className="h-4 w-4" />
        Back to member
      </Link>

      <div className="mb-6">
        <h1 className="font-display text-3xl sm:text-4xl font-bold tracking-tight">
          <span className="gradient-text">Edit roadmap</span>
        </h1>
        <p className="mt-2 text-ink-muted">
          Reorder, edit, or add tasks for this member&apos;s 30-day plan. Changes apply only
          to <strong>{displayName}</strong>.
        </p>
      </div>

      <MemberRoadmapEditor
        userId={params.id}
        memberName={displayName}
        initialTasks={(tasks ?? []) as Parameters<typeof MemberRoadmapEditor>[0]['initialTasks']}
      />
    </main>
  );
}

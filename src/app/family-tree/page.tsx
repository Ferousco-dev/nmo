import { redirect } from 'next/navigation';
import { Mail, MapPin, MessageSquare } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { TopNav } from '@/components/TopNav';
import { getT } from '@/lib/i18n/server';
import type { FamilyTreeMember } from '@/types';

export default async function FamilyTreePage() {
  const t = getT();
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: members } = await supabase
    .from('family_tree')
    .select('*')
    .order('display_order', { ascending: true });

  const rawAll = (members || []) as FamilyTreeMember[];

  // For every row that points at a Skool handle, pull the freshest
  // display_name + avatar from nmo_members. That table is rewritten
  // every day by the Apify cron, so the family tree mirrors live
  // Skool data without anyone touching family_tree again.
  const handles = rawAll
    .map((m) => m.skool_handle)
    .filter((h): h is string => typeof h === 'string' && h.length > 0);

  let liveByHandle = new Map<string, { display_name: string | null; avatar_url: string | null; profile_url: string | null }>();
  if (handles.length > 0) {
    const { data: live } = await supabase
      .from('nmo_members')
      .select('handle, display_name, avatar_url, profile_url')
      .in('handle', handles);
    if (live) {
      liveByHandle = new Map(
        live.map((row: { handle: string; display_name: string | null; avatar_url: string | null; profile_url: string | null }) => [
          row.handle,
          { display_name: row.display_name, avatar_url: row.avatar_url, profile_url: row.profile_url },
        ])
      );
    }
  }

  const all: FamilyTreeMember[] = rawAll.map((m) => {
    if (!m.skool_handle) return m;
    const fresh = liveByHandle.get(m.skool_handle);
    if (!fresh) return m;
    return {
      ...m,
      name: fresh.display_name ?? m.name,
      photo_url: fresh.avatar_url ?? m.photo_url,
    };
  });

  // Group by role tier. Anything that doesn't match a known tier
  // (a custom role typed in /admin/family-tree, for example) falls
  // through to the final catch-all so it always renders.
  const knownTiers: { label: string; roles: string[] }[] = [
    { label: '創辦人', roles: ['CEO / Founder', 'Founder', 'CEO'] },
    { label: '核心領導層', roles: ['COO', 'CMO', 'CSMO'] },
    { label: '地區指揮官', roles: ['Regional Commander'] },
    { label: '分區指揮官', roles: ['Subregional Commander'] },
    { label: '管理員', roles: ['Admin', 'Moderator'] },
  ];

  const knownRoleSet = new Set(knownTiers.flatMap((t) => t.roles));
  const otherMembers = all.filter((m) => !knownRoleSet.has(m.role));
  // Group "other" rows by their role text so each custom role gets
  // its own section (avoids dumping everything into one bucket).
  const otherByRole = new Map<string, FamilyTreeMember[]>();
  for (const m of otherMembers) {
    const list = otherByRole.get(m.role) ?? [];
    list.push(m);
    otherByRole.set(m.role, list);
  }
  const tiers = [
    ...knownTiers,
    ...Array.from(otherByRole.entries()).map(([role, ms]) => ({
      label: role,
      roles: [role],
      _preFiltered: ms,
    })),
  ] as Array<{ label: string; roles: string[]; _preFiltered?: FamilyTreeMember[] }>;

  return (
    <div className="min-h-screen">
      <TopNav />
      <main className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-10 animate-slide-up">
          <h1 className="font-display text-4xl md:text-5xl font-bold tracking-tight">
            <span className="gradient-text">{t.familyTree.title}</span>
          </h1>
          <p className="mt-3 text-ink-muted">{t.familyTree.subtitle}</p>
        </div>

        <div className="space-y-10">
          {tiers.map((tier) => {
            const tierMembers = tier._preFiltered ?? all.filter((m) => tier.roles.includes(m.role));
            if (tierMembers.length === 0) return null;

            return (
              <section key={tier.label}>
                <div className="flex items-center gap-3 mb-4">
                  <h2 className="font-display text-2xl font-bold text-ink">{tier.label}</h2>
                  <div className="h-px flex-1 bg-gradient-to-r from-line via-line to-transparent" />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {tierMembers.map((member) => (
                    <MemberCard key={member.id} member={member} />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      </main>
    </div>
  );
}

function MemberCard({ member }: { member: FamilyTreeMember }) {
  const t = getT();
  const initials = member.name
    .split(' ')
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <div className="card-premium p-5 hover:border-accent/40 transition-colors group">
      <div className="flex items-start gap-3 mb-3">
        {member.photo_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={member.photo_url}
            alt={member.name}
            className="h-14 w-14 rounded-xl object-cover"
          />
        ) : (
          <div className="h-14 w-14 rounded-xl bg-gradient-to-br from-accent/30 to-accent/10 border border-accent/20 flex items-center justify-center font-display text-xl font-bold text-accent">
            {initials}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-ink">{member.name}</h3>
          <p className="text-xs text-accent font-mono uppercase tracking-wider">
            {member.role}
          </p>
          {member.region && (
            <div className="flex items-center gap-1 text-xs text-ink-muted mt-1">
              <MapPin className="h-3 w-3" />
              {member.region}
            </div>
          )}
        </div>
      </div>

      {member.bio && (
        <p className="text-sm text-ink-muted leading-relaxed mb-3">{member.bio}</p>
      )}

      <div className="flex items-center gap-3 flex-wrap">
        {member.skool_handle && (
          <a
            href={`https://www.skool.com/@${member.skool_handle}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-2.5 h-8 rounded-md border border-accent/40 bg-accent/10 text-accent hover:bg-accent/20 transition-colors text-xs font-medium"
          >
            <MessageSquare className="h-3.5 w-3.5" />
            {t.familyTree.messageOnSkool}
          </a>
        )}
        {member.contact_email && (
          <a
            href={`mailto:${member.contact_email}`}
            className="inline-flex items-center gap-1.5 text-xs text-ink-muted hover:text-accent transition-colors font-medium"
          >
            <Mail className="h-3.5 w-3.5" />
            {t.familyTree.contact}
          </a>
        )}
      </div>
    </div>
  );
}

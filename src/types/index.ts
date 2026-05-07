export type Tenure = 'warrior' | 'ninja' | 'wizard' | 'dragon';
/**
 * Pathway — the 3 possible roadmap outcomes per client brief.
 * Replaces tenure as the primary signal for `track_assigned`.
 */
export type Pathway = 'foundation' | 'growth' | 'scale';
export type Goal = 'agency' | 'saas' | 'content' | 'coaching';
export type Intensity = 'easy' | 'pro';

export type SkoolMembershipStatus = 'unverified' | 'pending' | 'verified' | 'rejected';

export interface Profile {
  id: string;
  email: string;
  display_name: string | null;
  skool_url: string | null;
  skool_handle: string | null;
  skool_display_name: string | null;
  skool_avatar_url: string | null;
  skool_verified_at: string | null;
  skool_membership_status: SkoolMembershipStatus;
  tenure: Tenure | null;
  pathway: Pathway | null;
  goal: Goal | null;
  intensity: Intensity | null;
  track_assigned: string | null;
  total_points: number;
  current_level: number;
  streak_count: number;
  last_active_at: string;
  onboarding_completed: boolean;
  created_at: string;
  updated_at: string;
}

export type EngagementEventType = 'post' | 'comment' | 'reply' | 'like';

export interface EngagementEvent {
  id: string;
  user_id: string | null;
  skool_handle: string;
  event_type: EngagementEventType;
  source_id: string;
  target_post_id: string | null;
  target_post_url: string | null;
  content_excerpt: string | null;
  occurred_at: string;
  detected_at: string;
}

export interface EngagementGrade {
  user_id: string;
  skool_handle: string;
  display_name: string;
  avatar_url: string | null;
  tenure: Tenure | null;
  posts_count: number;
  comments_count: number;
  replies_count: number;
  likes_count: number;
  engagement_score: number;
  last_active_at: string | null;
}

export interface UserTask {
  id: string;
  user_id: string;
  day_number: number;
  task_id: string;
  task_title: string;
  task_description: string | null;
  skool_lesson_url: string | null;
  is_completed: boolean;
  completed_at: string | null;
  created_at: string;
}

export interface FamilyTreeMember {
  id: string;
  name: string;
  role: string;
  region: string | null;
  contact_email: string | null;
  photo_url: string | null;
  bio: string | null;
  parent_id: string | null;
  display_order: number;
}

export interface EventCode {
  code: string;
  description: string | null;
  points_value: number;
  expires_at: string | null;
  max_uses: number | null;
  current_uses: number;
  is_active: boolean;
}

export interface RoadmapDay {
  day: number;
  title: string;
  tasks: RoadmapTask[];
}

// =====================================================
// Badges
// =====================================================
export type BadgeCategory = 'tier' | 'streak' | 'milestone' | 'event' | 'special';

export interface Badge {
  id: string;
  key: string;
  name_zh: string;
  name_en: string;
  description_zh: string | null;
  description_en: string | null;
  /** Lucide icon component name, e.g. 'Trophy', 'Crown' */
  icon: string | null;
  /** Hex colour for the badge background / accent */
  color: string | null;
  /** 1–10 for tier badges, null for one-off specials */
  tier: number | null;
  /** Total points needed to auto-earn (tier badges only) */
  points_threshold: number | null;
  category: BadgeCategory;
  is_active: boolean;
  display_order: number;
}

export interface UserBadge {
  id: string;
  user_id: string;
  badge_id: string;
  awarded_at: string;
  awarded_by: string | null;
  reason: string | null;
}

/** Convenience join shape used in the UI */
export interface UserBadgeWithDetails extends UserBadge {
  badge: Badge;
}

export interface RoadmapTask {
  id: string;
  title: string;
  description: string;
  skool_lesson_url?: string;
}

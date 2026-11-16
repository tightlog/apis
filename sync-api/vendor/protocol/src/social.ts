import type { AttestErrorCode } from './attest';
import type { RequestErrorCode } from './errors';

export const socialPaths = {
  reviewSession: '/v1/review/session',
  me: '/v1/me',
  feedTerms: '/v1/me/feed-terms',
  feed: '/v1/feed',
  friendsFeed: '/v1/feed/friends',
  spot: '/v1/spot',
  catches: '/v1/catches',
  myCatches: '/v1/catches/mine',
  catch: (id: string) => `/v1/catches/${encodeURIComponent(id)}`,
  catchComments: (catchId: string) =>
    `/v1/catches/${encodeURIComponent(catchId)}/comments`,
  comment: (commentId: string) =>
    `/v1/comments/${encodeURIComponent(commentId)}`,
  commentReports: (commentId: string) =>
    `/v1/comments/${encodeURIComponent(commentId)}/reports`,
  reports: '/v1/reports',
  profile: '/v1/profile',
  profileName: '/v1/profile/name',
  publicProfile: (handle: string) =>
    `/v1/profile/${encodeURIComponent(handle)}`,
  media: (key: string) => `/v1/media/${encodeURIComponent(key)}`,
  blocks: '/v1/blocks',
  block: (userId: string) => `/v1/blocks/${encodeURIComponent(userId)}`,
  friends: '/v1/friends',
  friend: (userId: string) => `/v1/friends/${encodeURIComponent(userId)}`,
  friendRequests: '/v1/friends/requests',
  acceptFriendRequest: (userId: string) =>
    `/v1/friends/requests/${encodeURIComponent(userId)}/accept`,
  groups: '/v1/groups',
  joinGroup: '/v1/groups/join',
  group: (groupId: string) => `/v1/groups/${encodeURIComponent(groupId)}`,
  groupPosts: (groupId: string) =>
    `/v1/groups/${encodeURIComponent(groupId)}/posts`,
  leaveGroup: (groupId: string) =>
    `/v1/groups/${encodeURIComponent(groupId)}/members/me`,
  competitions: '/v1/competitions',
  joinCompetition: '/v1/competitions/join',
  publicCompetitions: '/v1/competitions/public',
  competition: (compId: string) =>
    `/v1/competitions/${encodeURIComponent(compId)}`,
  competitionInvite: (compId: string) =>
    `/v1/competitions/${encodeURIComponent(compId)}/invite`,
  competitionEntry: (compId: string) =>
    `/v1/competitions/${encodeURIComponent(compId)}/entry`,
  endCompetition: (compId: string) =>
    `/v1/competitions/${encodeURIComponent(compId)}/end`,
  leaveCompetition: (compId: string) =>
    `/v1/competitions/${encodeURIComponent(compId)}/participants/me`,
  competitionParticipant: (compId: string, userId: string) =>
    `/v1/competitions/${encodeURIComponent(compId)}/participants/${encodeURIComponent(userId)}`,
  reviewCompetitionEntry: (compId: string, userId: string) =>
    `/v1/competitions/${encodeURIComponent(compId)}/entries/${encodeURIComponent(userId)}/review`,
  competitionDraw: (compId: string) =>
    `/v1/competitions/${encodeURIComponent(compId)}/draw`,
  competitionState: (compId: string) =>
    `/v1/competitions/${encodeURIComponent(compId)}/state`,
  competitionWeights: (compId: string) =>
    `/v1/competitions/${encodeURIComponent(compId)}/weights`,
  competitionMatch: (compId: string) =>
    `/v1/competitions/${encodeURIComponent(compId)}/match`,
  adminSweep: '/v1/admin/sweep',
  operatorTakedown: '/v1/admin/operator-takedown',
  operatorCommentTakedown: '/v1/admin/operator-comment-takedown',
  adminTakedown: (catchId: string) =>
    `/v1/admin/takedown/${encodeURIComponent(catchId)}`,
} as const;

export type SocialErrorCode =
  | AttestErrorCode
  | RequestErrorCode
  | 'already_reported'
  | 'blocked'
  | 'cannot_block_self'
  | 'cannot_friend_self'
  | 'cannot_remove_organiser'
  | 'competition_closed'
  | 'competition_not_found'
  | 'competition_not_started'
  | 'competition_started'
  | 'corrupt_entry'
  | 'empty_body'
  | 'entry_not_found'
  | 'feed_terms_required'
  | 'forbidden'
  | 'handle_not_found'
  | 'handle_required'
  | 'handle_taken'
  | 'invalid_comment'
  | 'invalid_competition'
  | 'invalid_competition_name'
  | 'invalid_decision'
  | 'invalid_display_name'
  | 'invalid_draw'
  | 'invalid_entry'
  | 'invalid_group_name'
  | 'invalid_handle'
  | 'invalid_invite_code'
  | 'invalid_invites'
  | 'invalid_join_code'
  | 'invalid_media_key'
  | 'invalid_name'
  | 'invalid_profile'
  | 'invalid_report'
  | 'invalid_request'
  | 'invalid_state_transition'
  | 'invalid_user'
  | 'invalid_weight'
  | 'invalid_window'
  | 'invite_code_unavailable'
  | 'invite_not_found'
  | 'join_code_unavailable'
  | 'lat_lng_required'
  | 'match_final'
  | 'media_not_uploaded'
  | 'missing_fields'
  | 'not_a_match'
  | 'not_a_member'
  | 'not_a_participant'
  | 'not_configured'
  | 'not_enough_pegs'
  | 'not_owner'
  | 'not_the_organiser'
  | 'pegs_not_drawn'
  | 'request_not_found'
  | 'review_access_denied'
  | 'review_not_required'
  | 'review_token_failed'
  | 'unauthorized'
  | 'unsupported_media_type'
  | 'weigh_in_closed'
  | 'window_too_long';

export interface SocialErrorBody {
  error: SocialErrorCode;
}

export interface SocialComment {
  id: string;
  catchId: string;
  userId: string;
  authorName: string;
  parentId: string | null;
  body: string;
  createdAt: string;
}

export interface SocialCommentThread extends SocialComment {
  replies: SocialComment[];
}

export interface SocialCommentPage {
  items: SocialCommentThread[];
  nextCursor: string | null;
}

const COMMENT_BODY_MAX = 1000;

const EDGE_SPACE =
  /^[\s\u180E\u200B-\u200D\u2060]+|[\s\u180E\u200B-\u200D\u2060]+$/g;

const ZERO_WIDTH_JOINER = 0x200d;

function joinsPrevious(codePoint: number): boolean {
  return (
    codePoint === ZERO_WIDTH_JOINER ||
    (codePoint >= 0x0300 && codePoint <= 0x036f) ||
    (codePoint >= 0x1ab0 && codePoint <= 0x1aff) ||
    (codePoint >= 0x1dc0 && codePoint <= 0x1dff) ||
    (codePoint >= 0x20d0 && codePoint <= 0x20ff) ||
    (codePoint >= 0xfe00 && codePoint <= 0xfe0f) ||
    (codePoint >= 0xfe20 && codePoint <= 0xfe2f) ||
    (codePoint >= 0x1f3fb && codePoint <= 0x1f3ff) ||
    (codePoint >= 0xe0020 && codePoint <= 0xe007f)
  );
}

function isRegionalIndicator(codePoint: number): boolean {
  return codePoint >= 0x1f1e6 && codePoint <= 0x1f1ff;
}

export function commentLength(body: string): number {
  let length = 0;
  let afterJoiner = false;
  let openFlag = false;
  for (const char of body) {
    const codePoint = char.codePointAt(0) ?? 0;
    if (joinsPrevious(codePoint)) {
      afterJoiner = codePoint === ZERO_WIDTH_JOINER;
      continue;
    }

    if (afterJoiner) {
      afterJoiner = false;
      continue;
    }

    if (isRegionalIndicator(codePoint) && openFlag) {
      openFlag = false;
      continue;
    }

    openFlag = isRegionalIndicator(codePoint);
    length += 1;
  }

  return length;
}

export function normaliseCommentBody(text: string): string | null {
  const body = text.replace(EDGE_SPACE, '');
  if (body === '' || commentLength(body) > COMMENT_BODY_MAX) {
    return null;
  }

  return body;
}

export function authorNameSql(profileAlias: string, fallback = ''): string {
  return `COALESCE(NULLIF(${profileAlias}.name, ''), NULLIF(${profileAlias}.handle, ${profileAlias}.user_id), '${fallback}')`;
}

export type ModerationSubjectType = 'catch' | 'comment';

export interface ModerationSubjectTables {
  type: ModerationSubjectType;
  table: 'published_catches' | 'comments';
  reportsTable: 'reports' | 'comment_reports';
  reportColumn: 'catch_id' | 'comment_id';
  mediaColumn: 'media_key' | null;
  operatorTakedownPath: string;
  idKey: 'catchId' | 'commentId';
}

export const MODERATION_SUBJECTS = {
  catch: {
    type: 'catch',
    table: 'published_catches',
    reportsTable: 'reports',
    reportColumn: 'catch_id',
    mediaColumn: 'media_key',
    operatorTakedownPath: socialPaths.operatorTakedown,
    idKey: 'catchId',
  },
  comment: {
    type: 'comment',
    table: 'comments',
    reportsTable: 'comment_reports',
    reportColumn: 'comment_id',
    mediaColumn: null,
    operatorTakedownPath: socialPaths.operatorCommentTakedown,
    idKey: 'commentId',
  },
} as const satisfies Record<ModerationSubjectType, ModerationSubjectTables>;

export interface ModerationEvent {
  id: string;
  subject: ModerationSubjectType;
  subjectId: string;
  action: string;
  actor: string;
  payload?: Record<string, string>;
}

export interface SqlStatement {
  sql: string;
  args: string[];
}

export const AFTER_A_CHANGE: SqlStatement = {
  sql: 'changes() > 0',
  args: [],
};

const ALWAYS: SqlStatement = {
  sql: '1',
  args: [],
};

export function moderationEventExists(eventId: string): SqlStatement {
  return {
    sql: 'EXISTS (SELECT 1 FROM moderation_events WHERE id = ?)',
    args: [eventId],
  };
}

export function moderationEventStatement(
  event: ModerationEvent,
  when: SqlStatement = ALWAYS,
): SqlStatement {
  return {
    sql: `INSERT INTO moderation_events
            (id, subject_type, subject_id, action, actor, payload)
          SELECT ?, ?, ?, ?, ?, ? WHERE ${when.sql}`,
    args: [
      event.id,
      event.subject,
      event.subjectId,
      event.action,
      event.actor,
      JSON.stringify(event.payload ?? {}),
      ...when.args,
    ],
  };
}

export function commentAnchor(commentId: string): string {
  return `comment-${commentId}`;
}

export function moderationReviewUrl(
  subject: ModerationSubjectType,
  subjectId: string,
  env: 'production' | 'staging',
): string {
  return subject === 'catch'
    ? `https://moderation.tightlog.com/catch/${subjectId}?env=${env}`
    : `https://moderation.tightlog.com/?env=${env}#${commentAnchor(subjectId)}`;
}

export interface ModeratableFields {
  title: string;
  spotName: string;
  notes: string;
  anglerName: string;
  species: string;
  method: string;
  bait: string;
  peg: string;
}

export function moderatableText(fields: ModeratableFields): string {
  return [
    fields.anglerName,
    fields.title,
    fields.species,
    fields.spotName,
    fields.method,
    fields.bait,
    fields.peg,
    fields.notes,
  ]
    .map(part => part.trim())
    .filter(part => part !== '')
    .join('\n');
}

export function moderationMaterial(
  fields: ModeratableFields,
  mediaKey: string | null,
  mediaEtag: string | null,
): string {
  return `${moderatableText(fields)} ${mediaKey ?? ''} ${mediaEtag ?? ''}`;
}

export function socialAttestChallenge(method: string, path: string): string {
  return `${method}\n${path}`;
}

async function sha256Hex(material: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(material),
  );
  return [...new Uint8Array(digest)]
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('');
}

export function moderationHash(
  fields: ModeratableFields,
  mediaKey: string | null,
  mediaEtag: string | null,
): Promise<string> {
  return sha256Hex(moderationMaterial(fields, mediaKey, mediaEtag));
}

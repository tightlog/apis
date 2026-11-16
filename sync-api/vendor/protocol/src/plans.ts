export const PLAN_LIMITS = {
  freeCatches: 50,
  freeSpots: 3,
  freeOutlookDays: 3,
  proOutlookDays: 14,
  freeGenerations: 1,
  freeChatMessagesPerWeek: 5,
  proCloudChatMessagesPerWeek: 100,
} as const;

export type PlanFeatureId =
  | 'logging'
  | 'conditions'
  | 'offline'
  | 'competitions'
  | 'sharing'
  | 'backup'
  | 'outlook'
  | 'coach'
  | 'unlimited';

export const PLAN_FEATURE_LABEL = {
  logging: 'Catch, spot and session logging',
  conditions: 'Weather, moon and pressure saved with every catch',
  offline: 'Works with no signal on the bank',
  competitions: 'Competitions with a live leaderboard',
  sharing: 'Share to the feed with the spot kept approximate',
  backup: 'Backup and restore with one recovery code',
  outlook: `${PLAN_LIMITS.proOutlookDays}-day outlook, tides and bite windows`,
  coach: 'AI coach, debriefs and catch art',
  unlimited: 'Every catch unlocked, unlimited spots',
} as const satisfies Record<PlanFeatureId, string>;

export const FREE_FEATURES = [
  'logging',
  'conditions',
  'offline',
  'competitions',
  'sharing',
  'backup',
] as const satisfies readonly PlanFeatureId[];

export const PRO_FEATURES = [
  'outlook',
  'coach',
  'unlimited',
] as const satisfies readonly PlanFeatureId[];

export type ProFeatureId = (typeof PRO_FEATURES)[number];

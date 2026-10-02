'use client';

import type { OutingView } from '@/server/domain/outings';
import { TeeSheet } from './TeeSheet';

/** What a player (not the organizer) sees. Claiming and dropping out arrive with invite links (M4). */
export function OutingPlayerView({ view }: { view: OutingView }) {
  return <TeeSheet view={view} mode="friend" />;
}

/**
 * The narrator (NARRATOR in packages/game): spoken briefings, push-to-talk commands and
 * AI world events. All provider calls go through our server; the app never holds API keys.
 */
import * as Haptics from 'expo-haptics';
import { create } from 'zustand';

import { api, uuid } from '@/lib/api';
import type { GmEvent, VoiceTurn } from '@/lib/types';
import { useIsland } from '@/state/island';

export type NarratorLine = { id: string; who: 'narrator' | 'you' | 'world'; text: string; sources?: GmEvent['event']['sources'] };

type NarratorState = {
  lines: NarratorLine[];
  busy: 'briefing' | 'command' | 'gm' | null;
  error: string | null;
  conversationId: string | null;
  briefed: boolean;
  /** latest audio to play (path on our server) */
  audioPath: string | null;
  audioNonce: number;
  briefing: () => Promise<void>;
  say: (input: { text: string } | { audio: { mimeType: string; base64: string } }) => Promise<void>;
  worldEvent: () => Promise<void>;
};

const add = (lines: NarratorLine[], ...more: NarratorLine[]) => [...more.reverse(), ...lines].slice(0, 20);

function cueHaptics(keys: string[]) {
  if (keys.some((k) => k.includes('defeated') || k.includes('loot') || k.includes('shield_earned'))) {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  } else if (keys.some((k) => k.includes('hit') || k.includes('hazard') || k.includes('cannon') || k.includes('overboard'))) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {});
  } else if (keys.length) {
    Haptics.selectionAsync().catch(() => {});
  }
}

export const useNarrator = create<NarratorState>((set, get) => {
  const turn = async (body: Record<string, unknown>, kind: 'briefing' | 'command') => {
    set({ busy: kind, error: null });
    try {
      const r = await api<VoiceTurn>('POST', '/island/voice-turn', {
        requestId: uuid(),
        conversationId: get().conversationId,
        ...body,
      });
      const lines: NarratorLine[] = [];
      if (r.transcript) lines.push({ id: `${r.requestId}-you`, who: 'you', text: r.transcript });
      lines.push({ id: r.requestId, who: 'narrator', text: r.reply });
      set({
        conversationId: r.conversationId,
        lines: add(get().lines, ...lines),
        audioPath: r.audio?.url ?? null,
        audioNonce: get().audioNonce + 1,
      });
      cueHaptics(r.sfxCueKeys);
      if (r.result) await useIsland.getState().load();
    } catch (e) {
      console.warn('[voice] turn failed', e);
      set({ error: e instanceof Error ? e.message : String(e) });
    } finally {
      set({ busy: null });
    }
  };

  return {
    lines: [],
    busy: null,
    error: null,
    conversationId: null,
    briefed: false,
    audioPath: null,
    audioNonce: 0,
    briefing: async () => {
      if (get().briefed || get().busy) return;
      set({ briefed: true });
      await turn({ mode: 'briefing' }, 'briefing');
    },
    say: async (input) => turn({ mode: 'command', ...input }, 'command'),
    worldEvent: async () => {
      set({ busy: 'gm', error: null });
      try {
        const r = await api<GmEvent>('POST', '/island/gm-event', { requestId: uuid(), trigger: 'daily_briefing' });
        set({
          lines: add(get().lines, { id: r.event.id + r.requestId, who: 'world', text: r.event.narration, sources: r.event.sources }),
        });
        if (r.island.changedTile) {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
          await useIsland.getState().load();
        }
      } catch (e) {
        set({ error: e instanceof Error ? e.message : String(e) });
      } finally {
        set({ busy: null });
      }
    },
  };
});

/** One queued voice at a time, with captions shared by every screen. */
import * as Haptics from 'expo-haptics';
import { create } from 'zustand';

import { api, ApiError, uuid } from '@/lib/api';
import type { GmEvent, VoiceTurn } from '@/lib/types';
import { useIsland } from '@/state/island';
import { useSession } from '@/state/session';
import { cleanText } from '@/ui/text';

export type NarrationScene = 'arrival' | 'ship' | 'island' | 'quests' | 'log' | 'me' | 'activity' | 'move' | 'fight' | 'night';
export type NarratorLine = { id: string; who: 'narrator' | 'you' | 'world'; text: string; sources?: GmEvent['event']['sources'] };
export type NarrationClip = { id: string; text: string; audioPath: string | null; scene: NarrationScene };
type Job = { id: string; scene: NarrationScene; detail?: string };
const isVisit = (scene: NarrationScene) => ['ship', 'island', 'quests', 'log', 'me'].includes(scene);

type NarratorState = {
  lines: NarratorLine[];
  busy: 'briefing' | 'command' | 'gm' | null;
  error: string | null;
  conversationId: string | null;
  briefed: boolean;
  audioPath: string | null;
  audioNonce: number;
  current: NarrationClip | null;
  queue: Job[];
  muted: boolean;
  reset: () => void;
  narrate: (scene: NarrationScene, detail?: string) => void;
  playNext: () => Promise<void>;
  complete: (id: string) => void;
  toggleMute: () => void;
  briefing: () => Promise<void>;
  say: (input: { text: string } | { audio: { mimeType: string; base64: string } }) => Promise<void>;
  worldEvent: () => Promise<void>;
};

function localStory(scene: NarrationScene, detail?: string) {
  const me = useSession.getState().me;
  const v = useIsland.getState().view;
  const moves = me?.today.moves.remaining ?? v?.movesRemaining ?? 0;
  if (detail) return cleanText(detail);
  switch (scene) {
    case 'arrival': return `Welcome aboard, ${me?.user.name ?? 'sailor'}. ${me?.crew?.name ?? 'Your crew'} has another horizon to chase, and you have ${moves} Moves to begin the tale.`;
    case 'ship': return `Hear those sails, sailor? Your crew turns walks, quests, and calm days into wind. Tap the ship and give the rigging a little cheer.`;
    case 'island': return v?.island.conquered ? 'Your crew has claimed this shore. Rest your boots; a fresh horizon waits at nightfall.' : v?.explorer.hp === 0 ? 'The sea brought you back to shore. Rest today, sailor; tomorrow you return at full strength.' : `Land ahead. You have ${moves} Moves to chart the brass-marked paths${v ? `, while ${v.boss.name} guards the heart of the island` : ''}.`;
    case 'quests': return `A fine voyage begins ashore. You have logged ${me?.today.activities.length ?? 0} activities and walked ${(me?.today.steps ?? 0).toLocaleString()} steps today. Finish something in real life, then claim it here.`;
    case 'log': return `Open the ship's log, sailor. Every discovery and shared supply writes another line in your crew's story.`;
    case 'me': return `There you stand, ${me?.user.name ?? 'sailor'}, with ${me?.user.legend ?? 0} Legend to your name. Every real-life effort shapes the pirate you become.`;
    case 'night': return 'Night rolls over the deck. Check the chart for what the new tide brought your crew.';
    case 'fight': return 'Stand fast, sailor. Each action costs a Move, and the guardian answers in kind.';
    default: return 'Another little chapter in a voyage earned by living.';
  }
}

let generation = 0;
export const useNarrator = create<NarratorState>((set, get) => {
  const request = async (body: Record<string, unknown>, kind: 'briefing' | 'command') => {
    const version = generation;
    const controller = new AbortController();
    const deadline = setTimeout(() => controller.abort(), 30_000);
    const requestId = uuid();
    set({ busy: kind, error: null });
    try {
      let r: VoiceTurn;
      try {
        r = await api<VoiceTurn>('POST', '/island/voice-turn', { requestId, conversationId: get().conversationId, ...body }, { signal: controller.signal });
      } catch (error) {
        if (!(error instanceof ApiError) || error.status !== 404 || !get().conversationId || version !== generation) throw error;
        // Conversations expire after a day. A fresh one keeps tomorrow's tale alive.
        set({ conversationId: null });
        r = await api<VoiceTurn>('POST', '/island/voice-turn', { requestId, conversationId: null, ...body }, { signal: controller.signal });
      }
      if (version !== generation) return null;
      const line: NarratorLine = { id: r.requestId, who: 'narrator', text: cleanText(r.reply) };
      set({ conversationId: r.conversationId, lines: [line, ...get().lines].slice(0, 20), audioPath: r.audio?.url ?? null, audioNonce: get().audioNonce + 1 });
      if (r.result) await useIsland.getState().load();
      return r;
    } catch (e) {
      if (version === generation) set({ error: e instanceof Error ? e.message : String(e) });
      return null;
    } finally {
      clearTimeout(deadline);
    }
  };
  return {
    lines: [], busy: null, error: null, conversationId: null, briefed: false, audioPath: null, audioNonce: 0,
    current: null, queue: [], muted: false,
    reset: () => { generation++; set({ lines: [], busy: null, error: null, conversationId: null, briefed: false, audioPath: null, audioNonce: 0, current: null, queue: [] }); },
    toggleMute: () => set({ muted: !get().muted }),
    narrate: (scene, detail) => {
      if (!useSession.getState().me?.crew) return;
      if (!detail && get().current?.scene === scene) return;
      const pending = get().queue;
      if (pending.some((job) => job.scene === scene && job.detail === detail)) return;
      // Keep the latest unspoken destination; never replace a sentence already being said.
      const queue = isVisit(scene) ? pending.filter((job) => !isVisit(job.scene)) : pending;
      set({ queue: [...queue, { id: uuid(), scene, detail: detail?.slice(0, 400) }].slice(-5) });
    },
    playNext: async () => {
      if (get().current || get().busy || !get().queue.length) return;
      const version = generation;
      const [job, ...rest] = get().queue;
      set({ queue: rest });
      const result = await request({ mode: 'narration', scene: job!.scene, ...(job!.detail ? { detail: job!.detail } : {}) }, 'briefing');
      if (version !== generation) return;
      if (isVisit(job!.scene) && get().queue.some((next) => isVisit(next.scene))) { set({ busy: null }); return; }
      set({ busy: null, current: { id: job!.id, scene: job!.scene, text: result ? cleanText(result.reply) : localStory(job!.scene, job!.detail), audioPath: result?.audio?.url ?? null } });
    },
    complete: (id) => { if (get().current?.id === id) set({ current: null }); },
    briefing: async () => { get().narrate('island'); },
    say: async (input) => {
      if (get().busy || get().current) return;
      const version = generation;
      const result = await request({ mode: 'command', ...input }, 'command');
      if (version === generation) set({ busy: null, ...(result ? { current: { id: result.requestId, scene: 'island', text: cleanText(result.reply), audioPath: result.audio?.url ?? null } } : {}) });
    },
    worldEvent: async () => {
      if (get().busy) return;
      const version = generation;
      set({ busy: 'gm', error: null });
      try {
        const r = await api<GmEvent>('POST', '/island/gm-event', { requestId: uuid(), trigger: 'daily_briefing' });
        if (version !== generation) return;
        set({ lines: [{ id: r.event.id + r.requestId, who: 'world' as const, text: cleanText(r.event.narration), sources: r.event.sources }, ...get().lines].slice(0, 20) });
        get().narrate('island', r.event.narration);
        if (r.island.changedTile) { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {}); await useIsland.getState().load(); }
      } catch (e) { if (version === generation) set({ error: e instanceof Error ? e.message : String(e) }); }
      finally { if (version === generation) set({ busy: null }); }
    },
  };
});

import { ACTIVITIES } from '@last-voyage/game';
import * as Haptics from 'expo-haptics';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, View } from 'react-native';

import { Btn, C, H, P, Panel, Row, Tag } from '@/components/kit';
import { ACTIVITY_SPRITE, Sprite } from '@/components/sprites';
import { api, uuid } from '@/lib/api';
import type { PersonalizedQuest, QuestBoard, QuestCompletion } from '@/lib/types';
import { useSession } from '@/state/session';

type Action = 'complete' | 'skip';

/** Only the old activity picker is replaced; all existing daily reward caps still apply. */
export function PersonalizedQuests({ userId }: { userId: string }) {
  const [board, setBoard] = useState<QuestBoard | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<{ id: string; action: Action } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const alive = useRef(true);
  const locked = useRef(false);
  const sequence = useRef(0);
  const requestIds = useRef(new Map<string, string>());
  const current = useCallback(() => alive.current && useSession.getState().me?.user.id === userId, [userId]);

  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; };
  }, []);

  const load = useCallback(async (quiet = false) => {
    if (locked.current || !current()) return;
    const ticket = ++sequence.current;
    if (!quiet) setLoading(true);
    setError(null);
    try {
      const next = await api<QuestBoard>('GET', '/quests');
      if (current() && ticket === sequence.current) setBoard(next);
    } catch (e) {
      if (current() && ticket === sequence.current) setError(e instanceof Error ? e.message : 'Your quests could not be loaded.');
    } finally {
      if (current() && ticket === sequence.current) setLoading(false);
    }
  }, [current]);

  useFocusEffect(useCallback(() => {
    void load();
    const timer = setInterval(() => {
      if (AppState.currentState !== 'background' && AppState.currentState !== 'inactive') void load(true);
    }, 60_000);
    const listener = AppState.addEventListener('change', (state) => { if (state === 'active') void load(true); });
    return () => { clearInterval(timer); listener.remove(); ++sequence.current; };
  }, [load]));

  const act = async (quest: PersonalizedQuest, action: Action) => {
    if (locked.current || loading || !current() || quest.status !== 'available') return;
    if (action === 'skip' && !board?.skips.remaining) return;
    locked.current = true;
    ++sequence.current;
    setBusy({ id: quest.id, action });
    setError(null);
    setToast(null);
    const intent = `${quest.id}:${action}`;
    const requestId = requestIds.current.get(intent) ?? uuid();
    requestIds.current.set(intent, requestId);
    try {
      if (action === 'complete') {
        const result = await api<QuestCompletion>('POST', `/quests/${encodeURIComponent(quest.id)}/complete`, { requestId });
        if (!current()) return;
        setBoard(result.board);
        useSession.getState().setMe({ today: result.today, ...(result.user ? { user: result.user } : {}) });
        const grant = result.grant;
        setToast(`Quest complete: +${grant.moves} Moves, +${grant.supplies} Supplies${grant.reduced ? ' (daily reward cap)' : ''}.`);
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        void useSession.getState().refresh();
      } else {
        const result = await api<{ board: QuestBoard }>('POST', `/quests/${encodeURIComponent(quest.id)}/skip`, { requestId });
        if (!current()) return;
        setBoard(result.board);
        setToast(`A new quest is ready. ${result.board.skips.remaining} skips left this week.`);
      }
      requestIds.current.delete(intent);
    } catch (e) {
      // Retain the request ID: retrying an uncertain response cannot spend another skip.
      if (current()) setError(e instanceof Error ? e.message : 'That quest could not be updated. Please try again.');
    } finally {
      locked.current = false;
      if (current()) setBusy(null);
    }
  };

  const resets = board ? new Date(board.skips.resetsAt) : null;
  const resetLabel = resets && Number.isFinite(resets.getTime())
    ? resets.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }) : 'Monday';
  const complete = Boolean(board?.quests.length && board.quests.every((quest) => quest.status === 'completed'));

  return <Panel>
    <Row style={{ justifyContent: 'space-between' }}><H>Your daily quests</H>{board ? <Tag label={`${board.skips.remaining}/5 SKIPS`} color={C.sky} /> : null}</Row>
    <P dim>Three real-life adventures picked for your interests, time, and pace. Finish the activity before claiming it.</P>
    {loading ? <Row><ActivityIndicator color={C.orange} /><P dim>Charting your quests...</P></Row> : null}
    {toast ? <Panel color={C.gold}><P>{toast}</P></Panel> : null}
    {error ? <Panel color={C.deep}><P color={C.red}>{error}</P><Btn small label="Refresh quests" color={C.sky} onPress={() => void load()} disabled={Boolean(busy)} /></Panel> : null}
    {board?.quests.map((quest) => {
      const done = quest.status === 'completed';
      const reward = ACTIVITIES[quest.kind];
      return <Panel key={quest.id} color={done ? C.cloud : C.white}>
        <Row gap={10} style={{ flexWrap: 'nowrap' }}>
          <Sprite name={ACTIVITY_SPRITE[quest.kind]!} size={34} />
          <View style={{ flex: 1, gap: 5 }}><H>{quest.title}</H><P dim>{quest.minutes} min · {reward.label}{done ? ' · Completed' : ''}</P></View>
        </Row>
        <P>{quest.description}</P>
        {done ? <P dim>Logged for your crew. Well sailed.</P> : <>
          <P dim>Up to {reward.moves} Moves · {reward.supplies} Supplies · daily caps apply</P>
          <Row>
            <Btn small label="I did it" onPress={() => void act(quest, 'complete')} busy={busy?.id === quest.id && busy.action === 'complete'} disabled={loading || Boolean(busy)} />
            <Btn small label="Skip quest" color={C.sky} onPress={() => void act(quest, 'skip')} busy={busy?.id === quest.id && busy.action === 'skip'} disabled={loading || Boolean(busy) || !board.skips.remaining} />
          </Row>
        </>}
      </Panel>;
    })}
    {complete ? <P>All of today&apos;s quests are complete. Fresh adventures arrive tomorrow.</P> : null}
    {board ? <>
      <P dim>Five skips each week, shared across your daily quests. Resets {resetLabel} in your time zone.</P>
      <P dim>{board.quests.some((quest) => quest.source === 'fallback') ? 'Personalized suggestions are available while the AI quest writer is offline.' : 'Written with Gemini from your quest preferences.'}</P>
    </> : null}
    <Btn small label="Change preferences" color={C.sky} onPress={() => router.push('/preferences')} disabled={Boolean(busy)} />
  </Panel>;
}

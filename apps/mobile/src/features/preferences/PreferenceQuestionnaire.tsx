import { LocalizedText as Text } from '@/features/language/LocalizedText';
import { LocalizedPressable as Pressable } from '@/features/language/LocalizedControls';
import { ACTIVITIES, ACTIVITY_KINDS, type ActivityKind } from '@last-voyage/game';
import { router } from 'expo-router';
import { useEffect, useRef, useState, type ElementRef } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { Bar, Btn, C, F, H, P, Panel, Row, Screen, Tag, Title } from '@/components/kit';
import { api } from '@/lib/api';
import type { User, VoyagePreferences } from '@/lib/types';
import { useSession } from '@/state/session';
import { useT } from '@/features/language/i18n';

type PreferencesInput = Omit<VoyagePreferences, 'completedAt'>;
type Draft = {
  interests: ActivityKind[];
  goals: PreferencesInput['goals'];
  dailyMinutes: PreferencesInput['dailyMinutes'] | null;
  pace: PreferencesInput['pace'] | null;
  setting: PreferencesInput['setting'] | null;
  company: PreferencesInput['company'] | null;
  timeOfDay: PreferencesInput['timeOfDay'] | null;
  avoid: ActivityKind[];
};

const QUESTIONS = [
  ['What do you enjoy?', 'Pick all the things you would like to do more often.'],
  ['What would you like more of?', 'Choose one or more goals for your real-life adventure.'],
  ['How much time fits your day?', 'Your daily quests will share this time. Small efforts still help your crew.'],
  ['What pace feels right?', 'Choose a starting point. You can change it whenever you like.'],
  ['Where do you like to spend time?', 'Your quests can fit the spaces you enjoy.'],
  ['Who do you like to adventure with?', 'Solo time and time together both count.'],
  ['When does a quest fit best?', 'This helps us suggest a good moment in your day.'],
  ['Anything you would rather skip?', 'Optional. These activities will stay out of your personalized quests.'],
] as const;

const GOALS: { value: PreferencesInput['goals'][number]; label: string; detail: string }[] = [
  { value: 'move_more', label: 'Move a little more', detail: 'Make room for everyday movement.' },
  { value: 'learn', label: 'Learn something', detail: 'Follow your curiosity and grow a skill.' },
  { value: 'create', label: 'Make things', detail: 'Build, draw, write, or try a hobby.' },
  { value: 'connect', label: 'Connect with people', detail: 'Give friends and family a little time.' },
  { value: 'reset', label: 'Find a calmer moment', detail: 'Take a pause and enjoy some breathing room.' },
  { value: 'get_organized', label: 'Feel more organized', detail: 'Make a small part of your day easier.' },
];

function initialDraft(preferences?: VoyagePreferences | null): Draft {
  return {
    interests: [...(preferences?.interests ?? [])],
    goals: [...(preferences?.goals ?? [])],
    dailyMinutes: preferences?.dailyMinutes ?? null,
    pace: preferences?.pace ?? null,
    setting: preferences?.setting ?? null,
    company: preferences?.company ?? null,
    timeOfDay: preferences?.timeOfDay ?? null,
    avoid: (preferences?.avoid ?? []).filter((kind) => !preferences?.interests.includes(kind)),
  };
}

function validStep(draft: Draft, step: number): boolean {
  return [draft.interests.length > 0, draft.goals.length > 0, draft.dailyMinutes !== null,
    draft.pace !== null, draft.setting !== null, draft.company !== null, draft.timeOfDay !== null,
    draft.avoid.every((kind) => !draft.interests.includes(kind))][step] ?? false;
}

function completeDraft(draft: Draft): PreferencesInput | null {
  if (QUESTIONS.some((_, index) => !validStep(draft, index)) || draft.dailyMinutes === null ||
    draft.pace === null || draft.setting === null || draft.company === null || draft.timeOfDay === null) return null;
  return { ...draft, dailyMinutes: draft.dailyMinutes, pace: draft.pace, setting: draft.setting,
    company: draft.company, timeOfDay: draft.timeOfDay };
}

export function PreferenceQuestionnaire({ user }: { user: User }) {
  const tx = useT();
  const [draft, setDraft] = useState<Draft>(() => initialDraft(user.preferences));
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const locked = useRef(false);
  const mounted = useRef(true);
  const request = useRef<AbortController | null>(null);
  const scroll = useRef<ElementRef<typeof ScrollView>>(null);
  const editing = Boolean(user.preferences?.completedAt);
  const [question, hint] = QUESTIONS[step]!;
  const ready = validStep(draft, step);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; request.current?.abort(); };
  }, []);
  useEffect(() => { scroll.current?.scrollTo({ y: 0, animated: false }); }, [step]);

  const select = <K extends keyof Draft>(key: K, value: Draft[K]) => {
    if (busy) return;
    setDraft((current) => ({ ...current, [key]: value }));
    setError(null);
  };
  const toggleInterest = (kind: ActivityKind) => {
    if (locked.current) return;
    setDraft((current) => ({ ...current,
      interests: current.interests.includes(kind) ? current.interests.filter((value) => value !== kind) : [...current.interests, kind],
      avoid: current.avoid.filter((value) => value !== kind),
    }));
    setError(null);
  };
  const move = (direction: -1 | 1) => {
    if (locked.current || (direction === 1 && !ready)) return;
    setError(null);
    setStep((current) => Math.max(0, Math.min(QUESTIONS.length - 1, current + direction)));
  };
  const save = async () => {
    const preferences = completeDraft(draft);
    if (locked.current || !preferences) return;
    locked.current = true;
    setBusy(true);
    setError(null);
    const controller = new AbortController();
    request.current = controller;
    try {
      if (useSession.getState().me?.user.id !== user.id) throw new Error('Your signed-in pirate changed. Open these questions again.');
      const result = await api<{ preferences: VoyagePreferences }>('PUT', '/me/preferences', preferences, { signal: controller.signal });
      if (!mounted.current) return;
      const current = useSession.getState().me;
      if (current?.user.id !== user.id) throw new Error('Your signed-in pirate changed. Open these questions again.');
      useSession.getState().setMe({ user: { ...current.user, preferences: result.preferences } });
      router.replace('/');
    } catch (failure) {
      if (mounted.current) setError(failure instanceof Error ? failure.message : 'Your preferences could not be saved. Please try again.');
    } finally {
      request.current = null;
      locked.current = false;
      if (mounted.current) setBusy(false);
    }
  };

  return <Screen scroll={false} padded={false}>
    <ScrollView ref={scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={s.content}>
      <Row style={{ justifyContent: 'space-between' }}><Tag label={editing ? 'YOUR PREFERENCES' : 'GETTING TO KNOW YOU'} color={C.sky} />
        {editing ? <Btn small label="Cancel" color={C.deep} disabled={busy} onPress={() => router.back()} /> : null}
      </Row>
      <View style={{ gap: 8 }}><Title size={32}>Make the voyage yours</Title><P dim>Your choices help Gemini suggest real-life quests that fit your day. You can change these answers later in Me.</P></View>
      {editing ? <P dim>Changes guide tomorrow&apos;s quests and any replacements you request today.</P> : null}
      <Bar value={step + 1} max={QUESTIONS.length} color={C.sky} label={tx('Question {number} of {total}', { number: step + 1, total: QUESTIONS.length })} />
      <Panel>
        <View accessibilityLiveRegion="polite" style={{ gap: 6 }}><H>{question}</H><P dim>{hint}</P></View>
        <View accessibilityRole={step === 0 || step === 1 || step === 7 ? undefined : 'radiogroup'} accessibilityLabel={tx(question)} style={{ gap: 9 }}>
          {step === 0 ? ACTIVITY_KINDS.map((kind) => <Choice key={kind} multiple label={ACTIVITIES[kind].label} selected={draft.interests.includes(kind)} disabled={busy} onPress={() => toggleInterest(kind)} />) : null}
          {step === 1 ? GOALS.map((goal) => <Choice key={goal.value} multiple label={goal.label} detail={goal.detail} selected={draft.goals.includes(goal.value)} disabled={busy}
            onPress={() => select('goals', draft.goals.includes(goal.value) ? draft.goals.filter((value) => value !== goal.value) : [...draft.goals, goal.value])} />) : null}
          {step === 2 ? ([5, 15, 30, 60] as const).map((minutes) => <Choice key={minutes} label={tx('{minutes} minutes', { minutes })} selected={draft.dailyMinutes === minutes} disabled={busy} onPress={() => select('dailyMinutes', minutes)} />) : null}
          {step === 3 ? ([['gentle', 'Easy does it', 'A gentle nudge with small, simple tasks.'], ['balanced', 'A steady breeze', 'A comfortable mix of easy wins and a little challenge.'], ['challenging', 'Ready for a challenge', 'A bit more effort, within the time you have.']] as const).map(([value, label, detail]) =>
            <Choice key={value} label={label} detail={detail} selected={draft.pace === value} disabled={busy} onPress={() => select('pace', value)} />) : null}
          {step === 4 ? ([['indoors', 'Mostly indoors'], ['outdoors', 'Mostly outdoors'], ['either', 'A bit of both']] as const).map(([value, label]) =>
            <Choice key={value} label={label} selected={draft.setting === value} disabled={busy} onPress={() => select('setting', value)} />) : null}
          {step === 5 ? ([['solo', 'On my own'], ['friends', 'With friends or family'], ['either', 'Either sounds good']] as const).map(([value, label]) =>
            <Choice key={value} label={label} selected={draft.company === value} disabled={busy} onPress={() => select('company', value)} />) : null}
          {step === 6 ? ([['morning', 'Morning'], ['afternoon', 'Afternoon'], ['evening', 'Evening'], ['flexible', 'Whenever it fits']] as const).map(([value, label]) =>
            <Choice key={value} label={label} selected={draft.timeOfDay === value} disabled={busy} onPress={() => select('timeOfDay', value)} />) : null}
          {step === 7 ? <>
            <Choice multiple label="Nothing to avoid" selected={draft.avoid.length === 0} disabled={busy} onPress={() => select('avoid', [])} />
            {ACTIVITY_KINDS.map((kind) => <Choice key={kind} multiple label={ACTIVITIES[kind].label} detail={draft.interests.includes(kind) ? 'One of your favorites' : undefined}
              selected={draft.avoid.includes(kind)} disabled={busy || draft.interests.includes(kind)} onPress={() => select('avoid', draft.avoid.includes(kind) ? draft.avoid.filter((value) => value !== kind) : [...draft.avoid, kind])} />)}
            <P dim>Favorites stay available. Go back to the first question if you want to change them.</P>
          </> : null}
        </View>
        {!ready ? <P dim>{step < 2 ? 'Choose at least one to continue.' : 'Choose an answer to continue.'}</P> : null}
      </Panel>
      {error ? <Panel color={C.deep}><P color={C.red}>{error}</P></Panel> : null}
      <Row style={{ flexWrap: 'nowrap' }}>
        {step > 0 ? <View style={{ flex: 1 }}><Btn label="Back" color={C.deep} disabled={busy} onPress={() => move(-1)} /></View> : null}
        <View style={{ flex: 2 }}>{step === QUESTIONS.length - 1
          ? <Btn label={editing ? 'Save preferences' : 'Find my quests'} disabled={!completeDraft(draft)} busy={busy} onPress={save} />
          : <Btn label="Continue" disabled={!ready || busy} onPress={() => move(1)} />}</View>
      </Row>
      <P dim center>Only these activity preferences are shared with Gemini for quest suggestions. Your face photo is never sent to AI.</P>
    </ScrollView>
  </Screen>;
}

function Choice({ label, detail, selected, disabled, multiple, onPress }: {
  label: string; detail?: string; selected: boolean; disabled?: boolean; multiple?: boolean; onPress: () => void;
}) {
  const tx = useT();
  return <Pressable accessibilityRole={multiple ? 'checkbox' : 'radio'} accessibilityLabel={detail ? `${tx(label)}. ${tx(detail)}` : tx(label)}
    accessibilityState={{ checked: selected, disabled: Boolean(disabled) }} disabled={disabled} onPress={onPress}
    style={({ pressed }) => [s.choice, selected && s.chosen, disabled && !selected && s.disabled, pressed && !disabled && { opacity: 0.76 }]}>
    <View style={[s.indicator, multiple ? { borderRadius: 5 } : { borderRadius: 20 }, selected && s.indicatorChosen]}><View style={[s.mark, !selected && { opacity: 0 }]} /></View>
    <View style={{ flex: 1, gap: 3 }}><Text style={s.label}>{label}</Text>{detail ? <Text style={s.detail}>{detail}</Text> : null}</View>
  </Pressable>;
}

const s = StyleSheet.create({
  content: { padding: 20, paddingBottom: 48, gap: 20 },
  choice: { minHeight: 56, borderRadius: 12, borderWidth: 1, borderColor: '#C8D7DC', backgroundColor: C.white, padding: 13, flexDirection: 'row', alignItems: 'center', gap: 12 },
  chosen: { backgroundColor: '#DBF2F6', borderColor: C.indigo },
  disabled: { opacity: 0.5 },
  indicator: { width: 22, height: 22, borderWidth: 1.5, borderColor: C.dimDark, alignItems: 'center', justifyContent: 'center' },
  indicatorChosen: { borderColor: C.indigo, backgroundColor: C.indigo },
  mark: { width: 8, height: 8, borderRadius: 4, backgroundColor: C.white },
  label: { color: C.ink, fontSize: 14, fontFamily: F.bodyBold },
  detail: { color: C.dimDark, fontSize: 12, lineHeight: 18, fontFamily: F.body },
});

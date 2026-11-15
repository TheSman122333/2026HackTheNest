/**
 * iPhone/web can't read the phone's step counter, so players type in today's steps from their
 * Health app (honor system). Every 1,000 steps is a Move, up to +6 a day.
 */
import { REWARDS, stepsToNextMove } from '@last-voyage/game';
import { useState } from 'react';
import { StyleSheet, TextInput } from 'react-native';

import { Bar, Btn, C, F, H, P, Panel, Row } from '@/components/kit';
import { Sprite } from '@/components/sprites';
import { api } from '@/lib/api';
import { useSession } from '@/state/session';

const CAP = REWARDS.movesFromSelfReportedStepsPerDay;

export function StepsCheckIn() {
  const today = useSession((s) => s.me?.today);
  const refresh = useSession((s) => s.refresh);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!today) return null;

  const steps = Number(draft.replace(/[^0-9]/g, ''));
  const valid = draft.trim() !== '' && Number.isFinite(steps) && steps <= 100_000;
  const next = stepsToNextMove(today.steps, CAP);
  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await api('PUT', '/moves/steps', { steps });
      await refresh();
      setDraft('');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Panel>
      <Row><Sprite name="fx_footsteps" size={28} /><H>Steps: {today.steps.toLocaleString()}</H></Row>
      <Bar value={today.moves.fromSteps} max={CAP} color={C.sea} label={`${today.moves.fromSteps}/${CAP} step Moves`} />
      <P dim>Open your phone&apos;s Health app and enter today&apos;s step count. Every 1,000 steps is a Move, up to {CAP} a day.{next === null ? ' Maxed for today!' : ''}</P>
      <Row style={{ flexWrap: 'nowrap' }}>
        <TextInput
          value={draft}
          onChangeText={(t) => setDraft(t.replace(/[^0-9,]/g, ''))}
          placeholder="e.g. 6,200"
          placeholderTextColor={C.dimDark}
          keyboardType="number-pad"
          inputMode="numeric"
          maxLength={7}
          accessibilityLabel="Today's steps"
          returnKeyType="done"
          onSubmitEditing={() => valid && save()}
          style={s.input}
        />
        <Btn small label="Save steps" color={C.sky} busy={busy} disabled={!valid} onPress={save} />
      </Row>
      {error ? <P color={C.red}>{error}</P> : null}
    </Panel>
  );
}

const s = StyleSheet.create({
  input: { flex: 1, borderWidth: 1, borderColor: '#D8D3C8', borderRadius: 10, paddingHorizontal: 12, minHeight: 48, fontFamily: F.bodyBold, fontSize: 18, backgroundColor: C.white, color: C.ink },
});

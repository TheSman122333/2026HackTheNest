/**
 * "<title> of the <crew>" with a selector. Your skill role is always available; more titles unlock
 * at Honor milestones, and the top tier lets you write your own (checked on the server).
 */
import { useState } from 'react';
import { ActivityIndicator, Modal, ScrollView, StyleSheet, View } from 'react-native';
import { LocalizedText as Text } from '@/features/language/LocalizedText';
import { LocalizedPressable as Pressable, LocalizedTextInput as TextInput } from '@/features/language/LocalizedControls';

import { Btn, C, F, H, P } from '@/components/kit';
import { api } from '@/lib/api';
import { useSession } from '@/state/session';
import { useT } from '@/features/language/i18n';
import { useLanguage } from '@/state/language';

type Titles = {
  current: string | null;
  ladder: { title: string; honor: number; unlocked: boolean }[];
  custom: { honor: number; unlocked: boolean };
};

function TitleOption({ label, note, active, locked, loading, disabled, onPress }: { label: string; note: string; active: boolean; locked?: boolean; loading: boolean; disabled: boolean; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ disabled: locked, selected: active }} disabled={locked || disabled} onPress={onPress}
      style={[s.option, active && s.optionActive, locked && { opacity: 0.5 }]}>
      <View style={{ flex: 1 }}>
        <Text style={s.optionTitle}>{locked ? '🔒 ' : ''}{label}</Text>
        <Text style={s.optionNote}>{note}</Text>
      </View>
      {loading ? <ActivityIndicator color={C.navy} /> : active ? <Text style={s.check}>✓</Text> : null}
    </Pressable>
  );
}

export function TitlePicker({ role }: { role: string }) {
  const tx = useT();
  const language = useLanguage((state) => state.language);
  const me = useSession((s) => s.me);
  const refresh = useSession((s) => s.refresh);
  const [open, setOpen] = useState(false);
  const [titles, setTitles] = useState<Titles | null>(null);
  const [custom, setCustom] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  if (!me) return null;
  const displayTitle = me.user.title ?? tx(role);

  const show = async () => {
    setOpen(true);
    setError(null);
    try { setTitles(await api<Titles>('GET', '/me/titles')); } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  };
  const choose = async (body: { title: string | null } | { custom: string }, key: string) => {
    setBusy(key);
    setError(null);
    try {
      await api('PUT', '/me/title', body);
      await refresh();
      setCustom('');
      setOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <Pressable accessibilityRole="button" accessibilityLabel={tx('Your title is {title}. Change title', { title: displayTitle })} onPress={show} hitSlop={6} style={s.trigger}>
        <P dim translatable={false}>{tx('{title} of the {crew}', { title: displayTitle, crew: me.crew?.name ?? '' })} ▾</P>
      </Pressable>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={s.scrim} onPress={() => setOpen(false)} accessibilityRole="button" accessibilityLabel="Close titles">
          <Pressable style={s.card} onPress={() => {}}>
            <H color={C.ink}>Choose your title</H>
            <P color={C.ink} translatable={false}>{tx('Shown as “title of the {crew}”. Earn Honor to unlock more.', { crew: me.crew?.name ?? '' })}</P>
            {!titles && !error ? <ActivityIndicator color={C.navy} /> : null}
            {titles ? (
              <ScrollView style={{ maxHeight: 380 }} contentContainerStyle={{ gap: 8 }}>
                <TitleOption label={role} note="Your skill role (default)" active={!me.user.title} loading={busy === 'role'} disabled={!!busy} onPress={() => choose({ title: null }, 'role')} />
                {titles.ladder.map((t) => (
                  <TitleOption key={t.title} loading={busy === t.title} disabled={!!busy} label={t.title} note={tx(t.unlocked ? 'Unlocked at {count} Honor' : 'Unlocks at {count} Honor', { count: t.honor.toLocaleString(language) })}
                    locked={!t.unlocked} active={me.user.title === t.title} onPress={() => choose({ title: t.title }, t.title)} />
                ))}
                <View style={[s.option, { flexDirection: 'column', alignItems: 'stretch', gap: 8 }, !titles.custom.unlocked && { opacity: 0.5 }]}>
                  <Text style={s.optionTitle}>{titles.custom.unlocked ? '' : '🔒 '}Your own title</Text>
                  <Text style={s.optionNote}>{titles.custom.unlocked ? 'Up to 24 letters. Keep it friendly and original.' : tx('Unlocks at {count} Honor', { count: titles.custom.honor.toLocaleString(language) })}</Text>
                  {titles.custom.unlocked ? (
                    <>
                      <TextInput value={custom} onChangeText={setCustom} maxLength={24} placeholder="e.g. Tide Whisperer" placeholderTextColor={C.dimDark}
                        accessibilityLabel="Your own title" style={s.input} />
                      <Btn small label="Use this title" color={C.gold} busy={busy === 'custom'} disabled={custom.trim().length < 2} onPress={() => choose({ custom }, 'custom')} />
                    </>
                  ) : null}
                </View>
              </ScrollView>
            ) : null}
            {error ? <P color={C.red}>{error}</P> : null}
            <Btn small label="Close" color={C.navy} onPress={() => setOpen(false)} />
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const s = StyleSheet.create({
  trigger: { alignSelf: 'flex-start', minHeight: 32, justifyContent: 'center' },
  scrim: { flex: 1, backgroundColor: '#031E36B3', alignItems: 'center', justifyContent: 'center', padding: 20 },
  card: { width: '100%', maxWidth: 440, backgroundColor: C.cloud, borderRadius: 18, padding: 18, gap: 12 },
  option: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1.5, borderColor: '#D8CDB4', borderRadius: 12, padding: 12, backgroundColor: C.white },
  optionActive: { borderColor: C.navy, backgroundColor: '#FFF3D5' },
  optionTitle: { fontFamily: F.ui, fontSize: 16, color: C.ink },
  optionNote: { fontFamily: F.body, fontSize: 12, color: C.dimDark },
  check: { fontFamily: F.ui, fontSize: 18, color: C.navy },
  input: { borderWidth: 1, borderColor: '#D8D3C8', borderRadius: 10, padding: 12, minHeight: 48, fontFamily: F.bodyBold, fontSize: 16, backgroundColor: C.white, color: C.ink },
});

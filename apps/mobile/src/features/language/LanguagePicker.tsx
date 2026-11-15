import { APP_LANGUAGES, type AppLanguage } from '@last-voyage/game';
import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Btn, C, H, P, Panel, Screen, Title } from '@/components/kit';
import { useLanguage } from '@/state/language';
import { useT } from './i18n';

export function LanguagePicker({ initial = false, onDone }: { initial?: boolean; onDone?: () => void }) {
  const language = useLanguage((state) => state.language);
  const choose = useLanguage((state) => state.chooseLanguage);
  const [draft, setDraft] = useState<AppLanguage>(language);
  const [query, setQuery] = useState('');
  const [saving, setSaving] = useState(false);
  const insets = useSafeAreaInsets();
  const t = useT();
  const matches = APP_LANGUAGES.filter((item) => `${item.name} ${item.nativeName} ${item.code}`.toLocaleLowerCase().includes(query.toLocaleLowerCase().trim()));
  const save = async () => {
    if (saving) return;
    setSaving(true);
    try { await choose(draft); onDone?.(); } finally { setSaving(false); }
  };

  return <Screen scroll={false} padded={false}>
    <View style={{ padding: 20, gap: 12 }}>
    <View style={{ gap: 10 }}>
      <Title size={32}>{initial ? 'Choose your language' : 'App language'}</Title>
      <P>The app and the Tidekeeper will use this language.</P>
    </View>
    <TextInput value={query} onChangeText={setQuery} placeholder={t('Search languages')} accessibilityLabel={t('Search languages')}
      placeholderTextColor={C.dimDark} style={styles.search} autoCorrect={false} />
    </View>
    <ScrollView keyboardShouldPersistTaps="handled" style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 12 }}>
    <View accessibilityRole="radiogroup" accessibilityLabel={t('Language')} style={{ gap: 8 }}>
      {matches.map((item) => <Pressable key={item.code} accessibilityRole="radio" accessibilityLabel={`${item.nativeName}, ${item.name}`} accessibilityState={{ checked: draft === item.code }}
        onPress={() => setDraft(item.code)} disabled={saving} style={[styles.language, draft === item.code && styles.selected]}>
        <View style={{ flex: 1, gap: 3 }}>
          <Text style={[styles.nativeName, item.direction === 'rtl' && { writingDirection: 'rtl' }]}>{item.nativeName}</Text>
          <Text style={styles.name}>{item.name}</Text>
        </View>
        <Text style={styles.check}>{draft === item.code ? '✓' : ''}</Text>
      </Pressable>)}
    </View>
    </ScrollView>
    <View style={{ padding: 20, paddingTop: 10, paddingBottom: Math.max(20, insets.bottom), gap: 8 }}>
    {saving ? <ActivityIndicator color={C.cloud} /> : null}
    <Btn label={initial ? 'Continue' : 'Save'} onPress={() => void save()} busy={saving} />
    {!initial && onDone ? <Btn label="Cancel" color={C.deep} onPress={onDone} disabled={saving} /> : null}
    </View>
  </Screen>;
}

export function LanguageSettings({ onPress }: { onPress: () => void }) {
  const language = useLanguage((state) => state.language);
  const status = useLanguage((state) => state.status);
  const retry = useLanguage((state) => state.retryTranslations);
  const current = APP_LANGUAGES.find((item) => item.code === language)!;
  return <Panel><H>Language</H><Text style={styles.current}>{current.nativeName}</Text>
    <P dim>The app and the Tidekeeper will use this language.</P>
    {status === 'loading' ? <P dim>Preparing translations…</P> : null}
    {status === 'fallback' ? <><P dim>Translations are unavailable. You can continue and try again later.</P><Btn small label="Try again" color={C.cloud} onPress={() => void retry()} /></> : null}
    <Btn label="Change language" color={C.sky} onPress={onPress} />
  </Panel>;
}

const styles = StyleSheet.create({
  search: { minHeight: 52, borderRadius: 12, padding: 14, backgroundColor: C.cloud, color: C.ink, fontSize: 16 },
  language: { minHeight: 64, borderRadius: 12, padding: 14, backgroundColor: C.cloud, borderWidth: 2, borderColor: 'transparent', flexDirection: 'row', alignItems: 'center', gap: 10 },
  selected: { borderColor: C.orange, backgroundColor: '#E1F4EE' },
  nativeName: { color: C.ink, fontSize: 18 }, name: { color: C.dimDark, fontSize: 12 },
  check: { color: C.ink, fontSize: 24, width: 30, textAlign: 'center' }, current: { color: C.ink, fontSize: 20 },
});

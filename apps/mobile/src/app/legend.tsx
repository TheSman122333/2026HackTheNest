import { LocalizedText as Text } from '@/features/language/LocalizedText';
import { LocalizedPressable as Pressable } from '@/features/language/LocalizedControls';
/** Legend leaderboard: your rank in your crew and across every crew, plus the demo "End the Year". */
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { Btn, C, F, P, Panel, Row, Screen, Tag, Title } from '@/components/kit';
import { PlayerAvatar } from '@/components/PlayerAvatar';
import { LEGEND_SUMMARY, LegendHelp } from '@/features/legend/LegendHelp';
import { useT } from '@/features/language/i18n';
import { useLanguage } from '@/state/language';
import { api } from '@/lib/api';
import type { LegendBoard, LegendRow } from '@/lib/types';

type Tab = 'crew' | 'global';

export default function LegendScreen() {
  const tx = useT();
  const language = useLanguage((state) => state.language);
  const [board, setBoard] = useState<LegendBoard | null>(null);
  const [tab, setTab] = useState<Tab>('crew');
  const [error, setError] = useState<string | null>(null);
  const [ending, setEnding] = useState(false);

  const load = useCallback(() => {
    api<LegendBoard>('GET', '/legend').then((b) => { setBoard(b); setError(null); }).catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  }, []);
  useFocusEffect(load);

  const endYear = async () => {
    setEnding(true);
    try {
      await api('POST', '/legend/end-year');
      router.push('/lodestar');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setEnding(false);
    }
  };

  const rows = board ? (tab === 'crew' ? board.crew : board.global) : [];
  const me = board?.me;
  return (
    <Screen>
      <Row style={{ justifyContent: 'space-between' }}>
        <Btn small label="Back" color={C.deep} onPress={() => router.back()} />
        <LegendHelp />
      </Row>
      <View style={{ gap: 4 }}>
        <Text style={s.eyebrow}>THE RACE FOR THE LODESTAR</Text>
        <Title>Legend</Title>
        <P dim>{LEGEND_SUMMARY} The top pirate across every crew claims the Lodestar at year end.</P>
      </View>

      {me ? (
        <Row gap={10}>
          <RankCard label="IN YOUR CREW" rank={me.crewRank} of={me.crewSize} />
          <RankCard label="ACROSS ALL CREWS" rank={me.globalRank} of={me.players} />
          <RankCard label="YOUR LEGEND" value={me.legend} />
        </Row>
      ) : null}

      <View style={s.tabs}>
        {(['crew', 'global'] as const).map((key) => (
          <Pressable key={key} accessibilityRole="tab" accessibilityState={{ selected: tab === key }} onPress={() => setTab(key)} style={[s.tab, tab === key && { backgroundColor: C.gold }]}>
            <Text style={[s.tabText, tab === key && { color: C.ink }]}>{key === 'crew' ? 'My crew' : 'All crews'}</Text>
          </Pressable>
        ))}
      </View>

      {error ? <Panel color={C.deep}><P color={C.red}>{error}</P><Btn small label="Try again" color={C.indigo} onPress={load} /></Panel> : null}
      {!board && !error ? <View style={{ paddingVertical: 40, alignItems: 'center' }}><ActivityIndicator color={C.gold} size="large" /></View> : null}

      {board ? (
        <Panel color={C.deep}>
          {rows.length ? rows.map((r) => <LegendRowView key={r.id} row={r} showCrew={tab === 'global'} />) : <P dim>No pirates here yet.</P>}
          {tab === 'global' && me && me.globalRank > rows.length ? <P dim>{tx('You are #{rank} of {players}. Keep living, keep climbing.', { rank: me.globalRank.toLocaleString(language), players: me.players.toLocaleString(language) })}</P> : null}
        </Panel>
      ) : null}

      {board?.lodestar?.winner ? (
        <Panel color={C.navy}>
          <Text style={s.eyebrow}>{tx('LAST LODESTAR · {year}', { year: board.lodestar.year.toLocaleString(language, { useGrouping: false }) })}</Text>
          <P translatable={false}>👑 {tx(board.lodestar.winner.isYou ? 'You claimed the Lodestar with {legend} Legend.' : '{name} claimed the Lodestar with {legend} Legend.', { name: board.lodestar.winner.name, legend: board.lodestar.winner.legend.toLocaleString(language) })}</P>
          <Btn small label="Replay the ceremony" color={C.indigo} onPress={() => router.push('/lodestar')} />
        </Panel>
      ) : null}

      <Panel color={C.deep}>
        <Text style={s.eyebrow}>DEMO</Text>
        <P dim>Skip to the end of the year: the pirate with the most Legend across every crew claims the Lodestar.</P>
        <Btn label="End the Year" color={C.gold} busy={ending} onPress={endYear} />
      </Panel>
    </Screen>
  );
}

function RankCard({ label, rank, of, value }: { label: string; rank?: number | null; of?: number; value?: number }) {
  const tx = useT();
  const language = useLanguage((state) => state.language);
  return (
    <View style={s.card}>
      <Text style={s.cardN}>{value !== undefined ? value.toLocaleString(language) : rank ? `#${rank.toLocaleString(language)}` : '—'}</Text>
      {of ? <Text style={s.cardOf}>{tx('of {count}', { count: of.toLocaleString(language) })}</Text> : null}
      <Text style={s.cardL}>{label}</Text>
    </View>
  );
}

function LegendRowView({ row, showCrew }: { row: LegendRow; showCrew: boolean }) {
  const tx = useT();
  const language = useLanguage((state) => state.language);
  return (
    <View style={[s.row, row.isYou && s.rowYou]}>
      <Text style={[s.rank, row.rank <= 3 && { color: C.gold }]}>{row.rank.toLocaleString(language)}</Text>
      <PlayerAvatar userId={row.id} avatarId={row.avatarId} size={40} />
      <View style={{ flex: 1 }}>
        <Text translatable={false} style={s.name} numberOfLines={1}>{row.lodestar ? '👑 ' : ''}{row.name}{row.isYou ? tx(' (you)') : ''}</Text>
        {showCrew && row.crewName ? <Text translatable={false} style={s.crew} numberOfLines={1}>{row.crewName}</Text> : null}
      </View>
      <Tag label={tx('{count} LEGEND', { count: row.legend.toLocaleString(language) })} color={row.isYou ? C.gold : C.indigo} />
    </View>
  );
}

const s = StyleSheet.create({
  eyebrow: { fontFamily: F.bodyBold, color: C.gold, fontSize: 9, letterSpacing: 1.8 },
  tabs: { flexDirection: 'row', backgroundColor: C.deep, borderRadius: 14, padding: 4, gap: 4 },
  tab: { flex: 1, borderRadius: 10, alignItems: 'center', justifyContent: 'center', minHeight: 48 },
  tabText: { fontFamily: F.bodyBold, color: C.cloud, fontSize: 13 },
  card: { flex: 1, minWidth: 92, backgroundColor: C.deep, borderRadius: 14, padding: 10, alignItems: 'center', borderWidth: 1, borderColor: '#3976A2' },
  cardN: { fontFamily: F.ui, fontSize: 24, color: C.gold },
  cardOf: { fontFamily: F.body, fontSize: 11, color: C.dimLight },
  cardL: { fontFamily: F.bodyBold, fontSize: 8, letterSpacing: 1, color: C.cloud, textAlign: 'center', marginTop: 2 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6, paddingHorizontal: 6, borderRadius: 12 },
  rowYou: { backgroundColor: '#FFD16A22' },
  rank: { width: 24, textAlign: 'center', fontFamily: F.ui, fontSize: 16, color: C.cloud },
  name: { fontFamily: F.bodyBold, fontSize: 15, color: C.cloud },
  crew: { fontFamily: F.body, fontSize: 12, color: C.dimLight },
});

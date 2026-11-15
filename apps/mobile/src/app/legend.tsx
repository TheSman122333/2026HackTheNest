/** Honor leaderboard: your crew, all pirates, and all ships; the one Lodestar and the demo "End the Year". */
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { Btn, C, F, P, Panel, Row, Screen, Tag, Title } from '@/components/kit';
import { PlayerAvatar } from '@/components/PlayerAvatar';
import { Sprite } from '@/components/sprites';
import { HONOR_SUMMARY, LegendHelp } from '@/features/legend/LegendHelp';
import { api } from '@/lib/api';
import type { LegendBoard, LegendRow, ShipRow } from '@/lib/types';

type Tab = 'ships' | 'crew' | 'global';
const TABS: { key: Tab; label: string }[] = [
  { key: 'ships', label: 'Ships' },
  { key: 'crew', label: 'My crew' },
  { key: 'global', label: 'All pirates' },
];

export default function HonorScreen() {
  const [board, setBoard] = useState<LegendBoard | null>(null);
  const [tab, setTab] = useState<Tab>('ships');
  const [error, setError] = useState<string | null>(null);
  const [ending, setEnding] = useState(false);
  const [password, setPassword] = useState('');

  const load = useCallback(() => {
    api<LegendBoard>('GET', '/legend').then((b) => { setBoard(b); setError(null); }).catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  }, []);
  useFocusEffect(load);

  const endYear = async () => {
    setEnding(true);
    try {
      const r = await api<{ season: { winner: unknown } }>('POST', '/legend/end-year', { password });
      setPassword('');
      if (r.season.winner) router.push('/lodestar');
      else setError('No ship has earned Honor yet. Log a real-life quest first.');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setEnding(false);
    }
  };

  const me = board?.me;
  const holder = board?.lodestar?.winner;
  return (
    <Screen>
      <Row style={{ justifyContent: 'space-between' }}>
        <Btn small label="Back" color={C.deep} onPress={() => router.back()} />
        <LegendHelp />
      </Row>
      <View style={{ gap: 4 }}>
        <Text style={s.eyebrow}>THE RACE FOR THE LODESTAR</Text>
        <Title>Honor</Title>
        <P dim>{HONOR_SUMMARY} A ship&apos;s Honor is its whole crew&apos;s. Only one ship in all the Tidewake ever claims the Lodestar.</P>
      </View>

      {me ? (
        <Row gap={10}>
          <RankCard label="YOUR SHIP" rank={me.shipRank} of={me.shipCount} />
          <RankCard label="IN YOUR CREW" rank={me.crewRank} of={me.crewSize} />
          <RankCard label="YOUR HONOR" value={me.legend} />
        </Row>
      ) : null}

      <View style={s.tabs}>
        {TABS.map(({ key, label }) => (
          <Pressable key={key} accessibilityRole="tab" accessibilityState={{ selected: tab === key }} onPress={() => setTab(key)} style={[s.tab, tab === key && { backgroundColor: C.gold }]}>
            <Text style={[s.tabText, tab === key && { color: C.ink }]}>{label}</Text>
          </Pressable>
        ))}
      </View>

      {error ? <Panel color={C.deep}><P color={C.red}>{error}</P><Btn small label="Try again" color={C.indigo} onPress={load} /></Panel> : null}
      {!board && !error ? <View style={{ paddingVertical: 40, alignItems: 'center' }}><ActivityIndicator color={C.gold} size="large" /></View> : null}

      {board ? (
        <Panel color={C.deep}>
          {tab === 'ships'
            ? (board.ships.length ? board.ships.map((sh) => <ShipRowView key={sh.id} row={sh} />) : <P dim>No ships have set sail yet.</P>)
            : (tab === 'crew' ? board.crew : board.global).map((r) => <PirateRowView key={r.id} row={r} showCrew={tab === 'global'} />)}
          {tab === 'global' && me && me.globalRank > board.global.length ? <P dim>You are #{me.globalRank} of {me.players}. Keep living, keep climbing.</P> : null}
          {tab === 'ships' && me?.shipRank && me.shipRank > board.ships.length ? <P dim>Your ship is #{me.shipRank} of {me.shipCount}.</P> : null}
        </Panel>
      ) : null}

      {holder ? (
        <Panel color={C.navy}>
          <Text style={s.eyebrow}>THE LODESTAR · CLAIMED {board!.lodestar!.year}</Text>
          <P>👑 {holder.isYours ? 'Your ship' : `The ${holder.crewName}`} claimed the one Lodestar with {holder.honor} Honor.</P>
          <Btn small label="Replay the ceremony" color={C.indigo} onPress={() => router.push('/lodestar')} />
        </Panel>
      ) : (
        <Panel color={C.deep}>
          <Text style={s.eyebrow}>DEMO</Text>
          <P dim>End the year: the ship with the most Honor claims the one and only Lodestar. It can only be claimed once, so it needs the organisers&apos; password.</P>
          <TextInput value={password} onChangeText={setPassword} placeholder="Password" placeholderTextColor={C.dimLight} secureTextEntry autoCapitalize="none" autoCorrect={false}
            accessibilityLabel="End the Year password" onSubmitEditing={() => password && endYear()} style={s.input} />
          <Btn label="End the Year" color={C.gold} busy={ending} disabled={!password} onPress={endYear} />
        </Panel>
      )}
    </Screen>
  );
}

function RankCard({ label, rank, of, value }: { label: string; rank?: number | null; of?: number; value?: number }) {
  return (
    <View style={s.card}>
      <Text style={s.cardN}>{value !== undefined ? value : rank ? `#${rank}` : '—'}</Text>
      {of ? <Text style={s.cardOf}>of {of}</Text> : null}
      <Text style={s.cardL}>{label}</Text>
    </View>
  );
}

function ShipRowView({ row }: { row: ShipRow }) {
  return (
    <View style={[s.row, row.isYours && s.rowYou]}>
      <Text style={[s.rank, row.rank <= 3 && { color: C.gold }]}>{row.rank}</Text>
      <View style={s.shipBadge}><Sprite name="t_anchor" size={26} /></View>
      <View style={{ flex: 1 }}>
        <Text style={s.name} numberOfLines={1}>{row.lodestar ? '👑 ' : ''}{row.name}{row.isYours ? ' (yours)' : ''}</Text>
        <Text style={s.crew}>{row.sailors} {row.sailors === 1 ? 'sailor' : 'sailors'}</Text>
      </View>
      <Tag label={`${row.honor} HONOR`} color={row.isYours ? C.gold : C.indigo} />
    </View>
  );
}

function PirateRowView({ row, showCrew }: { row: LegendRow; showCrew: boolean }) {
  return (
    <View style={[s.row, row.isYou && s.rowYou]}>
      <Text style={[s.rank, row.rank <= 3 && { color: C.gold }]}>{row.rank}</Text>
      <PlayerAvatar userId={row.id} avatarId={row.avatarId} size={40} />
      <View style={{ flex: 1 }}>
        <Text style={s.name} numberOfLines={1}>{row.lodestar ? '👑 ' : ''}{row.name}{row.isYou ? ' (you)' : ''}</Text>
        {showCrew && row.crewName ? <Text style={s.crew} numberOfLines={1}>{row.crewName}</Text> : null}
      </View>
      <Tag label={`${row.legend} HONOR`} color={row.isYou ? C.gold : C.indigo} />
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
  input: { borderWidth: 1, borderColor: '#3976A2', borderRadius: 10, paddingHorizontal: 14, minHeight: 50, fontFamily: F.body, fontSize: 16, color: C.cloud, backgroundColor: C.navy },
  shipBadge: { width: 40, height: 40, borderRadius: 20, backgroundColor: C.navy, alignItems: 'center', justifyContent: 'center' },
  name: { fontFamily: F.bodyBold, fontSize: 15, color: C.cloud },
  crew: { fontFamily: F.body, fontSize: 12, color: C.dimLight },
});

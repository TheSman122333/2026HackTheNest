import { LocalizedText as Text } from '@/features/language/LocalizedText';
import { LocalizedPressable as Pressable } from '@/features/language/LocalizedControls';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { Btn, C, F, H, P, Panel, Row, Screen, Tag, Title } from '@/components/kit';
import { Sprite } from '@/components/sprites';
import { PlayerAvatar } from '@/components/PlayerAvatar';
import { DeckAboard } from '@/features/ship/DeckAboard';
import { MemberRecord } from '@/features/ship/MemberRecord';
import { VoyageChart } from '@/features/ship/VoyageChart';
import { useT } from '@/features/language/i18n';
import { api } from '@/lib/api';
import type { ShipDeck, ShipUpgrade } from '@/lib/shipTypes';
import { useSession } from '@/state/session';
import { useLanguage } from '@/state/language';
import { cleanText } from '@/ui/text';

type Section = 'crew' | 'upgrades' | 'map';
const SECTIONS: { key: Section; label: string }[] = [{ key: 'crew', label: 'On deck' }, { key: 'upgrades', label: 'Upgrades' }, { key: 'map', label: 'Voyage map' }];

/** The ship's shared home: crew records, real upgrades, and the next horizon. */
export default function ShipDeckScreen() {
  const tx = useT();
  const language = useLanguage((state) => state.language);
  const number = (value: number) => value.toLocaleString(language);
  const me = useSession((s) => s.me);
  const [deck, setDeck] = useState<ShipDeck | null>(null);
  const [section, setSection] = useState<Section>('crew');
  const [selected, setSelected] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<ShipUpgrade['key'] | null>(null);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const locked = useRef(false);
  const crewId = me?.crew?.id;
  const monthLabel = deck ? new Date(`${deck.month.key}-15T12:00:00Z`).toLocaleDateString(language, { month: 'long', year: 'numeric', timeZone: deck.month.timeZone }) : '';
  const effectFor = (upgrade: ShipUpgrade, level: number) => tx(upgrade.key === 'sails' ? '+{percent}% wind from earned crew effort' : '{percent}% less effort needed for voyage preparation', { percent: number(level * 10) });

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try { setDeck(await api<ShipDeck>('GET', '/crew/deck')); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setLoading(false); }
  }, []);

  useFocusEffect(useCallback(() => {
    if (crewId) void load();
  }, [crewId, load]));

  const purchase = async (upgrade: ShipUpgrade) => {
    if (locked.current || upgrade.cost === null) return;
    locked.current = true;
    setBusy(upgrade.key);
    setError(null);
    setNotice(null);
    try {
      const updated = await api<ShipDeck>('POST', '/crew/upgrades', { key: upgrade.key, expectedLevel: upgrade.level });
      setDeck(updated);
      setNotice(tx('{upgrade} upgraded. Your crew\'s ship is stronger together.', { upgrade: tx(upgrade.name) }));
      void useSession.getState().refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      // Another sailor may have bought the same level. Refresh the visible price and treasury.
      try { setDeck(await api<ShipDeck>('GET', '/crew/deck')); } catch { /* Keep the last successful deck visible. */ }
    } finally { locked.current = false; setBusy(null); }
  };

  if (!me?.crew) return <Screen><Title>Your crew awaits</Title><P>Join a crew to step aboard its ship.</P><Btn label="Find a crew" onPress={() => router.replace('/crew-setup')} /></Screen>;
  const member = deck?.members.find((sailor) => sailor.id === selected);

  return <Screen>
    <Row style={{ justifyContent: 'space-between' }}>
      <Btn small label="Back to Ship" color={C.deep} onPress={() => router.back()} />
      {deck ? <Tag label={tx('{count} SHARED SUPPLIES', { count: number(deck.crew.stores.supplies ?? 0) })} color={C.gold} /> : null}
    </Row>
    <View style={{ gap: 5 }}><Text style={s.eyebrow}>YOUR SHARED SHIP</Text><Title translatable={false}>{deck?.crew.name ?? me.crew.name}</Title><P dim>One deck. Every sailor leaves a mark.</P></View>

    <View style={s.tabs}>
      {SECTIONS.map((tab) => <Pressable key={tab.key} accessibilityRole="tab" accessibilityState={{ selected: section === tab.key }} onPress={() => setSection(tab.key)} style={[s.tab, section === tab.key && { backgroundColor: C.gold }]}>
        <Text style={[s.tabText, section === tab.key && { color: C.ink }]}>{tab.label}</Text>
      </Pressable>)}
    </View>

    {error ? <Panel color={C.deep} style={{ borderColor: C.red }}><P color={C.red}>{error}</P><Btn small label="Refresh deck" color={C.indigo} onPress={load} busy={loading} disabled={busy !== null} /></Panel> : null}
    {notice ? <Panel color={C.deep} style={{ borderColor: C.green }}><P color={C.green}>{notice}</P></Panel> : null}
    {!deck && !error ? <View style={s.loading}><ActivityIndicator color={C.gold} size="large" /><P dim>Calling all hands aboard…</P></View> : null}

    {deck && section === 'crew' ? <>
      <DeckAboard members={deck.members} meId={me.user.id} onSelect={(sailor) => setSelected(sailor.id)} />
      <Panel>
        <Row style={{ justifyContent: 'space-between' }}><H>Your crew</H><Tag label={tx('{count} SAILORS', { count: number(deck.members.length) })} color={C.deep} /></Row>
        <P dim>{tx('Open any sailor\'s record for {month} and their whole voyage.', { month: monthLabel })}</P>
        {deck.members.map((sailor) => <Pressable key={sailor.id} accessibilityRole="button" accessibilityLabel={tx('View {name}\'s contribution record', { name: cleanText(sailor.name) })} onPress={() => setSelected(sailor.id)} style={({ pressed }) => [s.rosterRow, pressed && { backgroundColor: '#E9DDBF' }]}>
          <View style={s.avatar}><PlayerAvatar userId={sailor.id} avatarId={sailor.avatarId} size={44} /></View>
          <View style={{ flex: 1, gap: 3 }}><Text translatable={false} style={s.memberName}>{cleanText(sailor.name)}{sailor.id === me.user.id ? tx(' · you') : ''}</Text><Text style={s.memberNote}>{tx('{quests} quests · {damage} damage this month', { quests: number(sailor.monthly.quests), damage: number(sailor.monthly.bossDamage) })}</Text></View>
          <Text style={s.open}>View</Text>
        </Pressable>)}
      </Panel>
    </> : null}

    {deck && section === 'upgrades' ? <>
      <Panel color={C.deep}>
        <Row style={{ flexWrap: 'nowrap' }}><Sprite name="q_hobby" size={44} /><View style={{ flex: 1, gap: 4 }}><H>Build a better voyage</H><P dim>Upgrades use the shared Supplies earned by your crew.</P></View></Row>
        <Row style={{ justifyContent: 'space-between' }}><P>Wind efficiency</P><Tag label={`×${deck.sailing.windMultiplier.toLocaleString(language, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`} color={C.gold} /></Row>
      </Panel>
      {deck.upgrades.map((upgrade) => {
        const affordable = upgrade.cost !== null && (deck.crew.stores.supplies ?? 0) >= upgrade.cost;
        return <Panel key={upgrade.key}>
          <Row style={{ justifyContent: 'space-between', flexWrap: 'nowrap' }}><Row style={{ flex: 1, flexWrap: 'nowrap' }}><Sprite name={upgrade.key === 'helm' ? 'compass' : 'fx_wave'} size={42} /><View style={{ flex: 1 }}><H>{upgrade.name}</H></View></Row><Tag label={tx('LV {level} / {max}', { level: number(upgrade.level), max: number(upgrade.maxLevel) })} color={C.deep} /></Row>
          <P dim>{upgrade.description}</P>
          <View style={s.levels}>{Array.from({ length: upgrade.maxLevel }, (_, index) => <View key={index} style={[s.level, index < upgrade.level && { backgroundColor: C.orange }]} />)}</View>
          <P>{tx('Now: {effect}', { effect: effectFor(upgrade, upgrade.level) })}</P>
          {upgrade.nextEffect ? <P dim>{tx('Next: {effect}', { effect: effectFor(upgrade, upgrade.level + 1) })}</P> : null}
          <Btn label={upgrade.cost === null ? 'Fully upgraded' : tx('Upgrade · {cost} shared Supplies', { cost: number(upgrade.cost) })} icon={<Sprite name="coin" size={24} />} disabled={!affordable || busy !== null || loading} busy={busy === upgrade.key} onPress={() => purchase(upgrade)} />
          {upgrade.cost !== null && !affordable ? <P dim>{tx('{count} more Supplies needed. Log quests or find island loot together.', { count: number(upgrade.cost - (deck.crew.stores.supplies ?? 0)) })}</P> : null}
        </Panel>;
      })}
    </> : null}

    {deck && section === 'map' ? <VoyageChart map={deck.map} /> : null}
    {member && deck ? <MemberRecord key={member.id} member={member} month={deck.month} onClose={() => setSelected(null)} /> : null}
  </Screen>;
}

const s = StyleSheet.create({
  eyebrow: { fontFamily: F.bodyBold, color: C.gold, fontSize: 9, letterSpacing: 1.8 },
  tabs: { flexDirection: 'row', backgroundColor: C.deep, borderRadius: 14, padding: 4, gap: 4 },
  tab: { flex: 1, borderRadius: 10, alignItems: 'center', justifyContent: 'center', minHeight: 48, paddingHorizontal: 5 },
  tabText: { fontFamily: F.bodyBold, color: C.cloud, fontSize: 12 }, loading: { paddingVertical: 54, gap: 14, alignItems: 'center' },
  rosterRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderRadius: 12 },
  avatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: '#E0D8C3', alignItems: 'center', justifyContent: 'center' },
  memberName: { fontFamily: F.bodyBold, color: C.ink, fontSize: 14 }, memberNote: { fontFamily: F.body, color: C.dimDark, fontSize: 10 }, open: { fontFamily: F.bodyBold, color: '#226B91', fontSize: 11 },
  levels: { flexDirection: 'row', gap: 7 }, level: { flex: 1, height: 5, borderRadius: 3, backgroundColor: '#D8D4C7' },
});

import { router, useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { Btn, C, F, H, P, Panel, Row, Screen, Tag, Title } from '@/components/kit';
import { Sprite } from '@/components/sprites';
import { PlayerAvatar } from '@/components/PlayerAvatar';
import { DeckAboard } from '@/features/ship/DeckAboard';
import { MemberRecord } from '@/features/ship/MemberRecord';
import { VoyageChart } from '@/features/ship/VoyageChart';
import { api } from '@/lib/api';
import type { ShipDeck, ShipUpgrade } from '@/lib/shipTypes';
import { useSession } from '@/state/session';
import { cleanText } from '@/ui/text';

type Section = 'crew' | 'upgrades' | 'map';
const SECTIONS: { key: Section; label: string }[] = [{ key: 'crew', label: 'On deck' }, { key: 'upgrades', label: 'Upgrades' }, { key: 'map', label: 'Voyage map' }];

/** The ship's shared home: crew records, real upgrades, and the next horizon. */
export default function ShipDeckScreen() {
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
      setNotice(`${upgrade.name} upgraded. Your crew's ship is stronger together.`);
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
      {deck ? <Tag label={`${deck.crew.stores.supplies ?? 0} SHARED SUPPLIES`} color={C.gold} /> : null}
    </Row>
    <View style={{ gap: 5 }}><Text style={s.eyebrow}>YOUR SHARED SHIP</Text><Title>{deck?.crew.name ?? me.crew.name}</Title><P dim>One deck. Every sailor leaves a mark.</P></View>

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
        <Row style={{ justifyContent: 'space-between' }}><H>Your crew</H><Tag label={`${deck.members.length} SAILORS`} color={C.deep} /></Row>
        <P dim>Open any sailor&apos;s record for {deck.month.label} and their whole voyage.</P>
        {deck.members.map((sailor) => <Pressable key={sailor.id} accessibilityRole="button" accessibilityLabel={`View ${cleanText(sailor.name)}'s contribution record`} onPress={() => setSelected(sailor.id)} style={({ pressed }) => [s.rosterRow, pressed && { backgroundColor: '#E9DDBF' }]}>
          <View style={s.avatar}><PlayerAvatar userId={sailor.id} avatarId={sailor.avatarId} size={44} /></View>
          <View style={{ flex: 1, gap: 3 }}><Text style={s.memberName}>{cleanText(sailor.name)}{sailor.id === me.user.id ? ' · you' : ''}</Text><Text style={s.memberNote}>{sailor.monthly.quests} quests · {sailor.monthly.bossDamage} damage this month</Text></View>
          <Text style={s.open}>View</Text>
        </Pressable>)}
      </Panel>
    </> : null}

    {deck && section === 'upgrades' ? <>
      <Panel color={C.deep}>
        <Row style={{ flexWrap: 'nowrap' }}><Sprite name="q_hobby" size={44} /><View style={{ flex: 1, gap: 4 }}><H>Build a better voyage</H><P dim>Upgrades use the shared Supplies earned by your crew.</P></View></Row>
        <Row style={{ justifyContent: 'space-between' }}><P>Wind efficiency</P><Tag label={`×${deck.sailing.windMultiplier.toFixed(2)}`} color={C.gold} /></Row>
      </Panel>
      {deck.upgrades.map((upgrade) => {
        const affordable = upgrade.cost !== null && (deck.crew.stores.supplies ?? 0) >= upgrade.cost;
        return <Panel key={upgrade.key}>
          <Row style={{ justifyContent: 'space-between', flexWrap: 'nowrap' }}><Row style={{ flex: 1, flexWrap: 'nowrap' }}><Sprite name={upgrade.key === 'helm' ? 'compass' : 'fx_wave'} size={42} /><View style={{ flex: 1 }}><H>{upgrade.name}</H></View></Row><Tag label={`LV ${upgrade.level} / ${upgrade.maxLevel}`} color={C.deep} /></Row>
          <P dim>{upgrade.description}</P>
          <View style={s.levels}>{Array.from({ length: upgrade.maxLevel }, (_, index) => <View key={index} style={[s.level, index < upgrade.level && { backgroundColor: C.orange }]} />)}</View>
          <P>Now: {upgrade.effect}</P>
          {upgrade.nextEffect ? <P dim>Next: {upgrade.nextEffect}</P> : null}
          <Btn label={upgrade.cost === null ? 'Fully upgraded' : `Upgrade · ${upgrade.cost} shared Supplies`} icon={<Sprite name="coin" size={24} />} disabled={!affordable || busy !== null || loading} busy={busy === upgrade.key} onPress={() => purchase(upgrade)} />
          {upgrade.cost !== null && !affordable ? <P dim>{upgrade.cost - (deck.crew.stores.supplies ?? 0)} more Supplies needed. Log quests or find island loot together.</P> : null}
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

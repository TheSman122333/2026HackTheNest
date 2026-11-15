import { LocalizedText as Text } from '@/features/language/LocalizedText';
import { LocalizedPressable as Pressable } from '@/features/language/LocalizedControls';
import { Image } from 'expo-image';
import { useState } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';

import { Btn, C, F, P, Row } from '@/components/kit';
import { PlayerAvatar } from '@/components/PlayerAvatar';
import { useT } from '@/features/language/i18n';
import { useLanguage } from '@/state/language';
import type { ShipMember } from '@/lib/shipTypes';
import { Float } from '@/ui/motion';
import { cleanText } from '@/ui/text';

const PLACES = [
  { x: -39, y: 165 }, { x: 39, y: 165 },
  { x: -45, y: 286 }, { x: 45, y: 286 },
  { x: -38, y: 350 }, { x: 38, y: 350 },
];

/** Six comfortable tap targets per deck page; every sailor also appears in the roster. */
export function DeckAboard({ members, meId, onSelect }: { members: ShipMember[]; meId: string; onSelect: (member: ShipMember) => void }) {
  const tx = useT();
  const language = useLanguage((state) => state.language);
  const { width } = useWindowDimensions();
  const [page, setPage] = useState(0);
  const chartWidth = Math.min(Math.max(240, width - 40), 620);
  const shipSize = Math.min(570, Math.max(450, chartWidth * 1.4));
  const scale = shipSize / 520;
  const pages = Math.max(1, Math.ceil(members.length / PLACES.length));
  const deckPage = Math.min(page, pages - 1);
  const visible = members.slice(deckPage * PLACES.length, (deckPage + 1) * PLACES.length);

  return <View style={[s.chart, { width: chartWidth }]}>
    <View pointerEvents="none" style={s.sun} />
    <View pointerEvents="none" style={s.waterLine} />
    <View style={s.caption}>
      <Text style={s.kicker}>ALL HANDS ON DECK</Text>
      <Text style={s.detail}>Tap a sailor to open their voyage record</Text>
    </View>
    <Float amplitude={2.5} tilt={0.5} duration={4300} style={{ height: shipSize, width: chartWidth }}>
      <Image source={require('../../../assets/game/ships/voyage_ship_overhead.png')} contentFit="contain" accessible={false}
        style={{ position: 'absolute', width: shipSize, height: shipSize, left: (chartWidth - shipSize) / 2 }} />
      {visible.map((member, index) => {
        const place = PLACES[index]!;
        return <Pressable key={member.id} accessibilityRole="button" accessibilityLabel={tx('View {name}\'s contributions', { name: cleanText(member.name) })}
          onPress={() => onSelect(member)} style={({ pressed }) => [s.sailor, {
            left: chartWidth / 2 + place.x * scale - 27,
            top: place.y * scale - 27,
            borderColor: member.id === meId ? C.gold : '#D9F5FF',
            transform: [{ scale: pressed ? 0.93 : 1 }],
          }]}>
          <PlayerAvatar userId={member.id} avatarId={member.avatarId} size={47} />
          <View style={s.nameplate}><Text translatable={false} numberOfLines={1} style={s.sailorName}>{cleanText(member.name)}</Text></View>
        </Pressable>;
      })}
    </Float>
    <View style={s.footer}>
      {pages > 1 ? <Row style={{ justifyContent: 'space-between', flexWrap: 'nowrap' }}>
        <Btn small label="Previous" color={C.indigo} disabled={deckPage === 0} onPress={() => setPage(deckPage - 1)} />
        <P>{tx('Deck {page} / {pages}', { page: (deckPage + 1).toLocaleString(language), pages: pages.toLocaleString(language) })}</P>
        <Btn small label="Next" color={C.indigo} disabled={deckPage + 1 >= pages} onPress={() => setPage(deckPage + 1)} />
      </Row> : <P center>{tx(members.length === 1 ? '{count} sailor aboard' : '{count} sailors aboard', { count: members.length.toLocaleString(language) })}</P>}
    </View>
  </View>;
}

const s = StyleSheet.create({
  chart: { alignSelf: 'center', borderWidth: 1, borderColor: '#68BFE1', borderRadius: 24, overflow: 'hidden', backgroundColor: '#146BA3' },
  sun: { position: 'absolute', right: -70, top: 15, width: 220, height: 220, borderRadius: 110, backgroundColor: '#5FC6EB', opacity: 0.2 },
  waterLine: { position: 'absolute', left: 20, right: 20, height: 350, top: 130, borderWidth: 1, borderColor: '#B9EEFF20', borderRadius: 150 },
  caption: { paddingHorizontal: 18, paddingTop: 18, gap: 5 },
  kicker: { fontFamily: F.bodyBold, fontSize: 9, letterSpacing: 2, color: C.gold },
  detail: { fontFamily: F.body, fontSize: 11, color: '#D3F2FF' },
  sailor: { position: 'absolute', width: 54, height: 54, borderRadius: 27, borderWidth: 2, backgroundColor: '#123F66', alignItems: 'center', justifyContent: 'center', shadowColor: '#032442', shadowOpacity: 0.3, shadowOffset: { width: 0, height: 3 }, shadowRadius: 6, elevation: 3 },
  nameplate: { position: 'absolute', top: 47, width: 72, backgroundColor: '#073A6BEF', borderRadius: 5, paddingVertical: 3, paddingHorizontal: 4 },
  sailorName: { fontFamily: F.bodyBold, fontSize: 8, color: '#FFFFFF', textAlign: 'center' },
  footer: { paddingHorizontal: 14, paddingBottom: 16, marginTop: -8 },
});

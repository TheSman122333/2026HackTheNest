/** The Shipwright at the helm: today's speed (Moves) as a gauge, plus how to go faster. */
import { SHIPWRIGHT, shipwrightReport, type ShipSpeed } from '@last-voyage/game';
import { StyleSheet, Text, View } from 'react-native';

import { C, F, P, Panel, Row } from '@/components/kit';
import { TRACKING } from '@/lib/platform';
import { useSession } from '@/state/session';
import { cleanText } from '@/ui/text';

const SPEEDS: ShipSpeed[] = ['becalmed', 'slow', 'steady', 'swift', 'flying'];
const SPEED_COLOR: Record<ShipSpeed, string> = {
  becalmed: C.peri,
  slow: C.sky,
  steady: C.green,
  swift: C.orange,
  flying: C.red,
};

export function ShipwrightPanel({ crewAverageMoves }: { crewAverageMoves?: number } = {}) {
  const me = useSession((s) => s.me);
  if (!me) return null;
  const t = me.today;
  const input = { moves: t.moves, steps: t.steps, screen: t.screen, limits: me.user.limits, streak: t.streak, tracking: TRACKING };
  const personal = shipwrightReport(input);
  // Match the hero's crew pace without turning personal tips into crew statistics.
  const r = crewAverageMoves === undefined ? personal : shipwrightReport({ ...input, moves: { ...t.moves, total: crewAverageMoves } });
  const level = SPEEDS.indexOf(r.speed);

  return (
    <Panel>
      <Row style={{ justifyContent: 'space-between', flexWrap: 'nowrap' }}>
        <View style={{ flexShrink: 1 }}>
          <Text style={s.name}>The {SHIPWRIGHT.name}</Text>
          <P dim>{crewAverageMoves === undefined ? 'Your wind today · a little farther every day' : 'Crew pace · your next contributions'}</P>
        </View>
        <View style={[s.knots, { backgroundColor: SPEED_COLOR[r.speed] }]}>
          <Text style={s.knotsN}>{r.knots.toFixed(1)}</Text>
          <Text style={s.knotsL}>KNOTS</Text>
        </View>
      </Row>

      <View style={s.gauge}>
        {SPEEDS.map((sp, i) => (
          <View key={sp} style={[s.notch, { backgroundColor: i <= level ? SPEED_COLOR[sp] : '#EBD3A0' }]}>
            <Text style={[s.notchText, i <= level && { color: C.ink }]}>{sp}</Text>
          </View>
        ))}
      </View>

      <View style={s.quote}>
        <Text style={s.quoteText}>“{cleanText(r.headline)}”</Text>
        <View style={s.tail} />
      </View>
      {personal.tips.map((tip) => (
        <View key={tip} style={s.tip}><Text style={s.tipMark}>✦</Text><View style={{ flex: 1 }}><P>{tip}</P></View></View>
      ))}
    </Panel>
  );
}

const s = StyleSheet.create({
  name: { fontFamily: F.title, fontSize: 30, lineHeight: 38, color: C.ink },
  knots: { borderWidth: 3, borderColor: C.ink, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6, alignItems: 'center', transform: [{ rotate: '4deg' }] },
  knotsN: { fontFamily: F.ui, fontSize: 30, color: C.ink, lineHeight: 36 },
  knotsL: { fontFamily: F.ui, fontSize: 13, color: C.ink, lineHeight: 16 },
  gauge: { flexDirection: 'row', gap: 5 },
  notch: { flex: 1, borderRadius: 14, borderWidth: 2, borderColor: C.ink, paddingVertical: 5, alignItems: 'center' },
  notchText: { fontFamily: F.ui, fontSize: 11, color: C.ink, textTransform: 'uppercase' },
  quote: { backgroundColor: '#FFF8E6', borderRadius: 16, borderWidth: 2.5, borderColor: C.ink, padding: 14, marginBottom: 6 },
  quoteText: { fontFamily: F.ui, fontSize: 17, color: C.ink, lineHeight: 23 },
  tail: { position: 'absolute', left: 26, bottom: -12, width: 18, height: 18, backgroundColor: '#FFF8E6', borderRightWidth: 2.5, borderBottomWidth: 2.5, borderColor: C.ink, transform: [{ rotate: '45deg' }] },
  tip: { flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
  tipMark: { fontFamily: F.ui, color: C.red, fontSize: 16, lineHeight: 21 },
});

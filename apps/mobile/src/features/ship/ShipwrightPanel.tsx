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
    <Panel color={C.paper}>
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
          <View key={sp} style={[s.notch, { backgroundColor: i <= level ? SPEED_COLOR[sp] : C.fog }]}>
            <Text style={[s.notchText, i <= level && { color: C.ink }]}>{sp}</Text>
          </View>
        ))}
      </View>

      <View style={s.quote}>
        <Text style={s.quoteText}>“{cleanText(r.headline)}”</Text>
      </View>
      {personal.tips.map((tip) => (
        <P key={tip}>{tip}</P>
      ))}
    </Panel>
  );
}

const s = StyleSheet.create({
  name: { fontFamily: F.title, fontSize: 28, color: C.ink },
  knots: { borderWidth: 1, borderColor: '#38535D', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8, alignItems: 'center' },
  knotsN: { fontFamily: F.ui, fontSize: 28, color: C.ink, lineHeight: 32 },
  knotsL: { fontFamily: F.bodyBold, fontSize: 10, color: C.ink, letterSpacing: 1 },
  gauge: { flexDirection: 'row', gap: 4 },
  notch: { flex: 1, borderRadius: 4, paddingVertical: 6, alignItems: 'center' },
  notchText: { fontFamily: F.bodyBold, fontSize: 8, color: C.dimLight },
  quote: { backgroundColor: C.cloud, borderRadius: 10, padding: 14 },
  quoteText: { fontFamily: F.bodyBold, fontSize: 15, color: C.ink, lineHeight: 21 },
});

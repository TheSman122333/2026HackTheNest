/** The Shipwright at the helm: today's speed (Moves) as a gauge, plus how to go faster. */
import { SHIPWRIGHT, shipwrightReport, type ShipSpeed } from '@last-voyage/game';
import { StyleSheet, Text, View } from 'react-native';

import { C, F, P, Panel, Row } from '@/components/kit';
import { useSession } from '@/state/session';

const SPEEDS: ShipSpeed[] = ['becalmed', 'slow', 'steady', 'swift', 'flying'];
const SPEED_COLOR: Record<ShipSpeed, string> = {
  becalmed: C.peri,
  slow: C.sky,
  steady: C.green,
  swift: C.orange,
  flying: C.red,
};

export function ShipwrightPanel() {
  const me = useSession((s) => s.me);
  if (!me) return null;
  const t = me.today;
  const r = shipwrightReport({ moves: t.moves, steps: t.steps, screen: t.screen, limits: me.user.limits, streak: t.streak });
  const level = SPEEDS.indexOf(r.speed);

  return (
    <Panel color={C.deep}>
      <Row style={{ justifyContent: 'space-between', flexWrap: 'nowrap' }}>
        <View style={{ flexShrink: 1 }}>
          <Text style={s.name}>THE {SHIPWRIGHT.name.toUpperCase()}</Text>
          <P dim>At the helm, keeping her up to speed</P>
        </View>
        <View style={[s.knots, { backgroundColor: SPEED_COLOR[r.speed] }]}>
          <Text style={s.knotsN}>{r.knots}</Text>
          <Text style={s.knotsL}>KNOTS</Text>
        </View>
      </Row>

      <View style={s.gauge}>
        {SPEEDS.map((sp, i) => (
          <View key={sp} style={[s.notch, { backgroundColor: i <= level ? SPEED_COLOR[sp] : C.fog }]}>
            <Text style={[s.notchText, i <= level && { color: C.ink }]}>{sp.toUpperCase()}</Text>
          </View>
        ))}
      </View>

      <View style={s.quote}>
        <Text style={s.quoteText}>“{r.headline}”</Text>
      </View>
      {r.tips.map((tip) => (
        <P key={tip}>⚓ {tip}</P>
      ))}
    </Panel>
  );
}

const s = StyleSheet.create({
  name: { fontFamily: F.title, fontSize: 28, letterSpacing: 2, color: C.gold },
  knots: { borderWidth: 3, borderColor: C.ink, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 4, alignItems: 'center' },
  knotsN: { fontFamily: F.ui, fontSize: 28, color: C.ink, lineHeight: 32 },
  knotsL: { fontFamily: F.bodyBold, fontSize: 10, color: C.ink, letterSpacing: 1 },
  gauge: { flexDirection: 'row', gap: 4 },
  notch: { flex: 1, borderWidth: 2, borderColor: C.ink, borderRadius: 8, paddingVertical: 4, alignItems: 'center' },
  notchText: { fontFamily: F.bodyBold, fontSize: 8, color: C.dimLight, letterSpacing: 0.5 },
  quote: { backgroundColor: C.cloud, borderWidth: 2, borderColor: C.ink, borderRadius: 14, borderTopLeftRadius: 4, padding: 10 },
  quoteText: { fontFamily: F.bodyBold, fontSize: 15, color: C.ink, lineHeight: 21 },
});

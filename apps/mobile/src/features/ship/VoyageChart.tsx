import { LocalizedText as Text } from '@/features/language/LocalizedText';
import { StyleSheet, View } from 'react-native';

import { Bar, C, F, H, P, Panel, Row, Tag } from '@/components/kit';
import { Sprite, THEME_CARD } from '@/components/sprites';
import { useT } from '@/features/language/i18n';
import { useLanguage } from '@/state/language';
import type { ShipDeck } from '@/lib/shipTypes';
import { Float } from '@/ui/motion';

export function VoyageChart({ map }: { map: ShipDeck['map'] }) {
  const tx = useT();
  const language = useLanguage((state) => state.language);
  const number = (value: number) => value.toLocaleString(language);
  const pct = (value: number) => Math.max(0, Math.min(1, value)).toLocaleString(language, { style: 'percent', maximumFractionDigits: 0 });
  const { current, next, preparation } = map;
  const monthLabel = new Date(`${next.month}-15T12:00:00Z`).toLocaleDateString(language, { month: 'long', year: 'numeric', timeZone: 'UTC' });
  return <View style={{ gap: 18 }}>
    <Panel color={C.deep}>
      <Text style={s.eyebrow}>YOUR CURRENT SHORE</Text>
      <Row style={{ flexWrap: 'nowrap', gap: 14 }}>
        <Float amplitude={3} duration={3900}><Sprite name={THEME_CARD[current.theme] ?? 'map'} size={78} /></Float>
        <View style={{ flex: 1, gap: 5 }}><H translatable={false}>{current.name}</H><P dim>{tx('Expedition {number} · {theme}', { number: number(current.index + 1), theme: tx(current.theme) })}</P><Tag label={current.conquered ? 'CLAIMED BY YOUR CREW' : tx('{percent} CONQUERED', { percent: pct(current.conquestProgress) })} color={current.conquered ? C.green : C.gold} /></View>
      </Row>
      <Bar value={current.bossMaxHp - current.bossHp} max={current.bossMaxHp} color={C.red} label={tx('{boss} · {hp} / {max} HP remaining', { boss: current.bossName, hp: number(current.bossHp), max: number(current.bossMaxHp) })} />
      <Bar value={current.explored} max={current.totalTiles} color={C.sky} label={tx('Crew charted {explored} / {total} hexes', { explored: number(current.explored), total: number(current.totalTiles) })} />
      <P dim>{current.conquered ? 'The guardian has fallen. Your crew can sail onward at nightfall.' : 'Explore the island together and defeat its guardian to claim this shore.'}</P>
    </Panel>

    <View style={s.chart}>
      <Text style={s.eyebrow}>THE NEXT MONTHLY HORIZON</Text>
      <Text translatable={false} style={s.month}>{monthLabel}</Text>
      <View style={s.route}>
        <View style={s.routeLine} />
        <View style={s.port}><Sprite name="t_anchor" size={31} /><Text style={s.portLabel}>Current shore</Text></View>
        <Float amplitude={4} tilt={4} duration={3000}><View style={s.compass}><Sprite name="compass" size={48} /></View></Float>
        <View style={s.port}><Sprite name={THEME_CARD[next.theme] ?? 'map'} size={68} /><Text style={s.portLabel}>{tx('{theme} waters', { theme: tx(next.theme) })}</Text></View>
      </View>
      <Text translatable={false} style={s.destination}>{next.name}</Text>
      <P center>{next.event}</P>
      <View style={s.preparation}>
        <Row style={{ justifyContent: 'space-between' }}><Text style={s.readiness}>VOYAGE PREPARATION</Text><Text style={s.percent}>{pct(preparation.progress)}</Text></Row>
        <Bar value={preparation.effectiveMoves} max={preparation.targetMoves} color={C.gold} label={tx('{moves} / {target} preparation Moves', { moves: preparation.effectiveMoves.toLocaleString(language, { maximumFractionDigits: 1 }), target: preparation.targetMoves.toLocaleString(language) })} />
        {preparation.ready ? <Tag label="WIND READY FOR THE NEXT HORIZON" color={C.green} /> : null}
        <P dim>{preparation.source}</P>
        <P dim>{preparation.note}</P>
      </View>
    </View>
  </View>;
}

const s = StyleSheet.create({
  eyebrow: { color: C.gold, fontFamily: F.bodyBold, fontSize: 9, letterSpacing: 1.6 },
  chart: { padding: 20, borderRadius: 22, borderWidth: 1, borderColor: '#4FADD6', backgroundColor: '#11689F', gap: 10 },
  month: { fontFamily: F.bodyBold, color: '#C6EDFF', fontSize: 12 },
  route: { height: 120, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  routeLine: { position: 'absolute', top: 54, left: 28, right: 28, borderTopWidth: 1, borderStyle: 'dashed', borderColor: '#8AD9F8' },
  port: { width: 86, alignItems: 'center', justifyContent: 'center', gap: 8 },
  portLabel: { fontFamily: F.body, color: '#DAF3FF', fontSize: 9, textAlign: 'center' },
  compass: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center', backgroundColor: '#135B90', borderWidth: 1, borderColor: '#6ABFE0' },
  destination: { fontFamily: F.title, color: C.cloud, fontSize: 33, textAlign: 'center' },
  preparation: { borderTopWidth: 1, borderTopColor: '#6ABFE077', marginTop: 8, paddingTop: 18, gap: 12 },
  readiness: { fontFamily: F.bodyBold, color: '#D8F4FF', fontSize: 9, letterSpacing: 1.1 }, percent: { fontFamily: F.ui, color: C.gold, fontSize: 25 },
});

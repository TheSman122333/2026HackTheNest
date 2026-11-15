import { useState } from 'react';
import { dayKeyInTz } from '@last-voyage/game';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Btn, C, F, H, P, Panel, Row } from '@/components/kit';
import { PlayerAvatar } from '@/components/PlayerAvatar';
import type { ShipDeck, ShipMember, ShipMetrics } from '@/lib/shipTypes';
import { cleanText } from '@/ui/text';

const METRICS: { key: keyof ShipMetrics; label: string }[] = [
  { key: 'quests', label: 'Quests logged' }, { key: 'coins', label: 'Coins / Supplies' },
  { key: 'moves', label: 'Quest Moves earned' }, { key: 'bossDamage', label: 'Boss damage' },
  { key: 'upgrades', label: 'Upgrades purchased' }, { key: 'suppliesInvested', label: 'Supplies invested' },
  { key: 'steps', label: 'Personal steps recorded' },
];

export function MemberRecord({ member, month, onClose }: { member: ShipMember; month: ShipDeck['month']; onClose: () => void }) {
  const [period, setPeriod] = useState<'monthly' | 'overall'>('monthly');
  const stats = member[period];
  const history = period === 'monthly' ? member.history.filter((entry) => dayKeyInTz(new Date(entry.at), month.timeZone).slice(0, 7) === month.key) : member.history;
  return <Modal transparent visible animationType="slide" onRequestClose={onClose}>
    <View style={s.scrim}>
      <Pressable accessibilityRole="button" accessibilityLabel="Close sailor record" onPress={onClose} style={StyleSheet.absoluteFill} />
      <SafeAreaView edges={['bottom', 'left', 'right']} style={s.sheet}>
        <View style={s.handle} />
        <View style={s.sheetHead}>
          <View style={s.identity}><PlayerAvatar userId={member.id} avatarId={member.avatarId} size={60} /><View style={{ flex: 1, gap: 3 }}><Text style={s.name}>{cleanText(member.name)}</Text><Text style={s.legend}>{member.legend.toLocaleString()} Honor · Crew contributor</Text></View></View>
          <Btn small label="Close" color={C.indigo} onPress={onClose} />
        </View>
        <View style={s.period}>
          <Period label="This month" selected={period === 'monthly'} onPress={() => setPeriod('monthly')} />
          <Period label="All time" selected={period === 'overall'} onPress={() => setPeriod('overall')} />
        </View>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.record}>
          <Text style={s.eyebrow}>{period === 'monthly' ? `${month.label} CONTRIBUTIONS` : 'THE WHOLE VOYAGE'}</Text>
          <View style={s.metrics}>
            {METRICS.map((metric) => <View key={metric.key} style={s.metric}>
              <Text style={s.metricN}>{stats[metric.key].toLocaleString()}</Text>
              <Text style={s.metricLabel}>{metric.label}</Text>
            </View>)}
          </View>
          <P dim>Coins here are the Supplies this sailor earned for the shared ship. Quest Moves count activity rewards; steps are personal recorded totals.</P>
          {member.damageNote ? <P dim>{member.damageNote}</P> : null}
          <H>Recent contribution log</H>
          {history.length ? history.map((entry) => <View key={entry.id} style={s.entry}>
            <P>{entry.text}</P>
            <Text style={s.entryDate}>{new Date(entry.at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric', timeZone: month.timeZone })}</Text>
          </View>) : <Panel color={C.deep}><P>No recorded contributions in this period yet. Every little effort helps the crew.</P></Panel>}
          <Row><P dim>Showing recorded history for this crew.</P></Row>
        </ScrollView>
      </SafeAreaView>
    </View>
  </Modal>;
}

function Period({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return <Pressable accessibilityRole="tab" accessibilityState={{ selected }} onPress={onPress} style={[s.periodBtn, selected && { backgroundColor: C.gold }]}>
    <Text style={[s.periodText, selected && { color: C.ink }]}>{label}</Text>
  </Pressable>;
}

const s = StyleSheet.create({
  scrim: { flex: 1, justifyContent: 'flex-end', backgroundColor: '#031E36AA' },
  sheet: { maxHeight: '88%', backgroundColor: C.navy, borderTopLeftRadius: 28, borderTopRightRadius: 28, borderWidth: 1, borderColor: '#5BB2DD', overflow: 'hidden' },
  handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: '#75B8D5', alignSelf: 'center', marginTop: 12 },
  sheetHead: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 20 },
  identity: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  name: { color: C.cloud, fontFamily: F.title, fontSize: 27 }, legend: { fontFamily: F.body, color: C.dimLight, fontSize: 10 },
  period: { flexDirection: 'row', gap: 6, marginHorizontal: 20, backgroundColor: C.deep, borderRadius: 12, padding: 4 },
  periodBtn: { flex: 1, minHeight: 48, borderRadius: 9, alignItems: 'center', justifyContent: 'center' }, periodText: { color: C.cloud, fontFamily: F.bodyBold, fontSize: 13 },
  record: { padding: 20, paddingBottom: 36, gap: 16 },
  eyebrow: { color: C.gold, fontFamily: F.bodyBold, fontSize: 9, letterSpacing: 1.6 },
  metrics: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  metric: { width: '47%', backgroundColor: '#11578B', borderRadius: 14, padding: 14, gap: 5 },
  metricN: { color: C.gold, fontFamily: F.ui, fontSize: 27, fontVariant: ['tabular-nums'] }, metricLabel: { color: C.cloud, fontFamily: F.body, fontSize: 11 },
  entry: { borderBottomWidth: 1, borderBottomColor: '#31729C', paddingBottom: 12, gap: 6 }, entryDate: { fontFamily: F.body, fontSize: 10, color: C.dimLight },
});

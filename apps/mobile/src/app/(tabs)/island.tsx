/** The island: tap a highlighted hex to walk there (costs Moves). Reach the center to fight. */
import { useFocusEffect, router } from 'expo-router';
import { useCallback } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Bar, Btn, C, F, H, P, Panel, Row, Screen, Tag } from '@/components/kit';
import { avatarFor, BOSS_SPRITE, ITEM_SPRITE, Sprite, THEME_CARD } from '@/components/sprites';
import { HexBoard } from '@/features/island/HexBoard';
import { NarratorPanel } from '@/features/narrator/NarratorPanel';
import { useNarrator } from '@/features/narrator/useNarrator';
import { ITEM_GLYPH, useIsland } from '@/state/island';
import { useSession } from '@/state/session';

const SEA = '#0D1B2A';
const PARCHMENT = '#F4EBD0';
const BRASS = '#C8963E';

export const THEME_NAME: Record<string, string> = {
  tropical: 'Palmshade Isle',
  spooky: 'Gloomhollow',
  winter: 'Frostmere',
  volcanic: 'Cinderpeak',
};

export default function IslandScreen() {
  const { view, busy, error, feed, load, move } = useIsland();
  const me = useSession((s) => s.me);
  const gmTelemetry = useNarrator((s) => s.gmTelemetry);
  const meId = me?.user.id ?? '';

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  if (!view) {
    return (
      <Screen scroll={false} padded={false}>
        <View style={s.loading}>
          {error ? <P color={PARCHMENT}>{error}</P> : <ActivityIndicator color={PARCHMENT} size="large" />}
          {error ? <Btn label="Retry" onPress={load} /> : null}
        </View>
      </Screen>
    );
  }

  const ex = view.explorer;
  const bag = Object.entries(ex.inventory).filter(([, n]) => (n ?? 0) > 0);
  const ko = ex.hp <= 0;
  const theme = view.island.theme;
  const members = [
    ...(me ? [{ userId: me.user.id, name: me.user.name }] : []),
    ...view.crewmates.filter((member) => member.userId !== me?.user.id),
  ];

  return (
    <Screen scroll={false} padded={false}>
      <View style={s.page}>
        <ScrollView contentContainerStyle={s.scrollContent} showsVerticalScrollIndicator={false}>
          <View style={s.manifest}>
            <View style={s.manifestHeading}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={s.kicker}>CREW MANIFEST · ACTIVE VOYAGE</Text>
                <Text style={s.crewName} numberOfLines={1}>
                  {me?.crew?.name ?? 'YOUR CREW'}
                </Text>
              </View>
              <View style={s.moveChip}>
                <Sprite name="boots" size={22} />
                <Text style={s.moveValue}>{view.movesRemaining}</Text>
                <Text style={s.moveLabel}>MOVES</Text>
              </View>
            </View>
            <View style={s.memberRow}>
              {members.slice(0, 4).map((member) => (
                <View key={member.userId} style={s.memberChip}>
                  <View style={s.avatar}>
                    <Sprite name={avatarFor(member.userId)} size={26} />
                  </View>
                  <Text style={s.memberName} numberOfLines={1}>
                    {member.name}
                  </Text>
                </View>
              ))}
              {members.length === 0 ? <Text style={s.memberName}>Crew manifest unavailable</Text> : null}
            </View>
            <View style={s.streakRow}>
              <View style={s.streakChip}>
                <Text style={s.streakText}>CALM SEAS · {me?.today.streak.calmDays ?? 0}D</Text>
              </View>
              <View style={[s.streakChip, me?.today.streak.shoreLeaveBonus && s.streakActive]}>
                <Text style={[s.streakText, me?.today.streak.shoreLeaveBonus && s.streakTextActive]}>
                  SHORE LEAVE {me?.today.streak.shoreLeaveBonus ? '· +25%' : '· —'}
                </Text>
              </View>
            </View>
          </View>

          <View style={s.destination}>
            <Sprite name={THEME_CARD[theme] ?? 'm_jul'} size={48} />
            <View style={{ flex: 1 }}>
              <Text style={s.kicker}>EXPEDITION CHART · ISLAND {view.island.index + 1}</Text>
              <Text style={s.destinationName}>{THEME_NAME[theme] ?? 'Unknown Isle'}</Text>
            </View>
            <View style={s.islandStamp}>
              <Text style={s.stampText}>{theme.toUpperCase()}</Text>
            </View>
          </View>

          <View style={s.hpTrack}>
            <Text style={s.hpLabel}>CAPTAIN&apos;S VITALS</Text>
            <Bar value={ex.hp} max={ex.maxHp} color={ko ? C.red : C.green} label={`HP ${ex.hp}/${ex.maxHp}`} />
          </View>

          <View style={s.chartFrame}>
            <View style={s.chartHeading}>
              <Text style={s.chartTitle}>THE HEX CHART</Text>
              <Text style={s.chartHint}>TAP A REVEALED HEX TO SAIL</Text>
            </View>
            <HexBoard
              view={view}
              meId={meId}
              onTap={move}
              disabled={busy || ko}
              highlightHex={gmTelemetry?.changedTile?.hex ?? null}
            />
          </View>

          {gmTelemetry ? (
            <View style={s.telemetry}>
              <View style={s.telemetryTop}>
                <View style={s.liveDot} />
                <Text style={s.telemetryLabel}>OPENAI + EXA · {gmTelemetry.status.replace('_', ' ').toUpperCase()}</Text>
              </View>
              <Text style={s.telemetrySource} numberOfLines={1}>
                {gmTelemetry.sourceTitle ? `LORE SOURCE  /  ${gmTelemetry.sourceTitle}` : 'LORE SOURCE  /  NO CITATION RETURNED'}
              </Text>
              {gmTelemetry.changedTile ? (
                <Text style={s.telemetryEffect}>
                  TILE ALTERED · {gmTelemetry.changedTile.hex} · {gmTelemetry.changedTile.item.toUpperCase()}
                </Text>
              ) : (
                <Text style={s.telemetryEffect}>NO TILE ALTERED · THE ISLAND HOLDS ITS BREATH</Text>
              )}
            </View>
          ) : null}

          {view.island.conquered ? (
            <Panel color={SEA} style={s.callout}>
              <Row>
                <Sprite name="t_flag" size={36} />
                <H color={PARCHMENT}>Island conquered!</H>
              </Row>
              <P color={PARCHMENT}>Your crew beat {view.boss.name}. Tonight the ship sails on (or tap Advance Night on the Ship tab).</P>
            </Panel>
          ) : view.canFight ? (
            <Panel color={SEA} style={s.callout}>
              <Row style={{ flexWrap: 'nowrap' }}>
                <Sprite name={BOSS_SPRITE[view.boss.key] ?? 'b_octopus'} size={60} />
                <View style={{ flex: 1, gap: 4 }}>
                  <H color={PARCHMENT}>
                    {view.boss.name} {view.boss.title}
                  </H>
                  <Bar value={view.boss.hp} max={view.boss.maxHp} color={C.gold} label={`BOSS HP ${view.boss.hp}/${view.boss.maxHp}`} />
                </View>
              </Row>
              <Btn label="ENGAGE THE GUARDIAN" color={BRASS} icon={<Sprite name="cutlass" size={24} />} onPress={() => router.push('/fight')} />
            </Panel>
          ) : (
            <View style={s.bossNote}>
              <Text style={s.bossNoteText}>
                {ko
                  ? 'WASHED OVERBOARD · You return at full strength tomorrow.'
                  : view.movesRemaining === 0
                    ? 'OUT OF MOVES · Walk, log an activity, or stay off short-form video to earn more.'
                    : `THE GUARDIAN WAITS · ${view.boss.name} · ${view.boss.hp}/${view.boss.maxHp} HP`}
              </Text>
            </View>
          )}

          {bag.length ? (
            <View style={s.bag}>
              <Text style={s.kicker}>CAPTAIN&apos;S HOLD</Text>
              <Row gap={12}>
                {bag.map(([item, n]) => {
                  const sp = ITEM_SPRITE[item];
                  return (
                    <Row key={item} gap={4}>
                      {sp ? <Sprite name={sp} size={28} /> : <Text style={s.bagText}>{ITEM_GLYPH[item] ?? '✨'}</Text>}
                      <Text style={s.bagText}>
                        {item} ×{n}
                      </Text>
                    </Row>
                  );
                })}
              </Row>
            </View>
          ) : null}

          {error ? <Tag label={`⚠️ ${error}`} color={C.red} /> : null}
          {feed.slice(0, 4).map((line, i) => (
            <Text key={i} style={[s.logLine, i > 0 && { opacity: 0.72 }]}>
              {line}
            </Text>
          ))}
        </ScrollView>
        <NarratorPanel />
      </View>
    </Screen>
  );
}

const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: SEA },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, backgroundColor: SEA, padding: 20 },
  scrollContent: { paddingHorizontal: 8, paddingTop: 10, paddingBottom: 10, gap: 10 },
  manifest: { marginHorizontal: 8, padding: 12, gap: 9, backgroundColor: '#13283A', borderRadius: 16, borderWidth: 1, borderColor: BRASS },
  manifestHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  kicker: { fontFamily: F.bodyBold, fontSize: 9, letterSpacing: 1.8, color: BRASS },
  crewName: { fontFamily: F.title, fontSize: 24, letterSpacing: 1.2, color: PARCHMENT },
  moveChip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 9, paddingVertical: 4, borderRadius: 12, backgroundColor: PARCHMENT },
  moveValue: { fontFamily: F.ui, fontSize: 20, color: SEA },
  moveLabel: { fontFamily: F.bodyBold, fontSize: 9, letterSpacing: 0.7, color: SEA },
  memberRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 },
  memberChip: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 12, borderWidth: 1, borderColor: '#53606A', paddingVertical: 2, paddingHorizontal: 5, maxWidth: '48%' },
  avatar: { width: 26, height: 26, borderRadius: 13, backgroundColor: PARCHMENT, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  memberName: { fontFamily: F.bodyBold, fontSize: 11, color: PARCHMENT, flexShrink: 1 },
  streakRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  streakChip: { borderWidth: 1, borderColor: BRASS, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3, backgroundColor: SEA },
  streakActive: { backgroundColor: BRASS },
  streakText: { fontFamily: F.bodyBold, fontSize: 9, letterSpacing: 0.5, color: PARCHMENT },
  streakTextActive: { color: SEA },
  destination: { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 10 },
  destinationName: { fontFamily: F.title, fontSize: 24, letterSpacing: 1, color: PARCHMENT },
  islandStamp: { borderWidth: 1, borderColor: BRASS, borderRadius: 6, paddingHorizontal: 7, paddingVertical: 4, transform: [{ rotate: '-4deg' }] },
  stampText: { fontFamily: F.bodyBold, fontSize: 8, letterSpacing: 1, color: BRASS },
  hpTrack: { marginHorizontal: 12, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10, backgroundColor: '#13283A' },
  hpLabel: { fontFamily: F.bodyBold, fontSize: 9, letterSpacing: 1.5, color: BRASS, marginBottom: 2 },
  chartFrame: { alignItems: 'center', paddingTop: 6, paddingBottom: 6, borderWidth: 1, borderColor: '#344859', borderRadius: 20, backgroundColor: '#0A1723' },
  chartHeading: { width: '100%', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 14, paddingBottom: 3 },
  chartTitle: { fontFamily: F.bodyBold, fontSize: 10, letterSpacing: 2, color: BRASS },
  chartHint: { fontFamily: F.bodyBold, fontSize: 8, letterSpacing: 0.6, color: '#A8B1B6' },
  telemetry: { marginHorizontal: 8, padding: 10, borderWidth: 1, borderColor: BRASS, borderRadius: 12, backgroundColor: '#13283A', gap: 3 },
  telemetryTop: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#8EE6B0' },
  telemetryLabel: { fontFamily: F.bodyBold, fontSize: 9, letterSpacing: 1, color: '#8EE6B0' },
  telemetrySource: { fontFamily: F.bodyBold, fontSize: 11, color: PARCHMENT },
  telemetryEffect: { fontFamily: F.bodyBold, fontSize: 9, letterSpacing: 0.5, color: BRASS },
  callout: { borderColor: BRASS, borderWidth: 1, borderRadius: 14, padding: 10 },
  bossNote: { marginHorizontal: 8, borderLeftWidth: 2, borderColor: BRASS, paddingVertical: 5, paddingHorizontal: 10 },
  bossNoteText: { fontFamily: F.bodyBold, fontSize: 10, letterSpacing: 0.7, color: PARCHMENT },
  bag: { marginHorizontal: 8, padding: 10, borderWidth: 1, borderColor: '#344859', borderRadius: 12, gap: 6 },
  bagText: { fontFamily: F.body, fontSize: 12, color: PARCHMENT },
  logLine: { marginHorizontal: 12, fontFamily: F.body, fontSize: 11, color: '#C4CDD1' },
});

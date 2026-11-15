import { LocalizedText as Text } from '@/features/language/LocalizedText';
import { LocalizedPressable as Pressable } from '@/features/language/LocalizedControls';
/** A readable, pannable sea chart. Rules and reachable tiles stay server-owned. */
import { distance, parseKey, toPixel, type HexKey, type Terrain } from '@last-voyage/game';
import * as Haptics from 'expo-haptics';
import { memo, useEffect, useRef, useState, type ElementRef } from 'react';
import { Animated, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';

import { C, F } from '@/components/kit';
import { BOSS_SPRITE, ITEM_SPRITE, Sprite } from '@/components/sprites';
import { PlayerAvatar } from '@/components/PlayerAvatar';
import type { IslandView } from '@/lib/types';
import { Float, useMotionEnabled } from '@/ui/motion';

export const TERRAIN_COLOR: Record<Terrain, string> = {
  sea: '#167CB2',
  beach: '#F2D08A',
  grass: '#90CC83',
  jungle: '#398A67',
  rock: '#9DB7CB',
  ruins: '#D8BC88',
  town: '#E5A868',
  swamp: '#8EAA70',
  volcano: '#E68A68',
  snow: '#DEF6FF',
};

type Props = {
  view: IslandView;
  meId: string;
  onTap: (k: HexKey) => void;
  disabled?: boolean;
};

/** Three native shapes keep the chart hexagonal without introducing another dependency. */
function HexSurface({ width, color }: { width: number; color: string }) {
  const height = width * 2 / Math.sqrt(3);
  return (
    <View pointerEvents="none" style={{ width, height, position: 'absolute' }}>
      <View style={{ borderLeftWidth: width / 2, borderRightWidth: width / 2, borderBottomWidth: height / 4, borderLeftColor: 'transparent', borderRightColor: 'transparent', borderBottomColor: color }} />
      <View style={{ height: height / 2, backgroundColor: color }} />
      <View style={{ borderLeftWidth: width / 2, borderRightWidth: width / 2, borderTopWidth: height / 4, borderLeftColor: 'transparent', borderRightColor: 'transparent', borderTopColor: color }} />
    </View>
  );
}

/** A tap marks the chosen destination immediately, before the server resolves travel. */
function ChartRipple({ x, y, enabled }: { x: number; y: number; enabled: boolean }) {
  const [ripple] = useState(() => new Animated.Value(0));
  useEffect(() => {
    if (!enabled) return;
    const animation = Animated.timing(ripple, { toValue: 1, duration: 550, useNativeDriver: true, isInteraction: false });
    animation.start();
    return () => animation.stop();
  }, [ripple, enabled]);
  if (!enabled) return null;
  return <Animated.View pointerEvents="none" style={[s.tapRipple, {
    left: x - 23, top: y - 23,
    opacity: ripple.interpolate({ inputRange: [0, 0.25, 1], outputRange: [0.8, 0.65, 0] }),
    transform: [{ scale: ripple.interpolate({ inputRange: [0, 1], outputRange: [0.55, 1.8] }) }],
  }]} />;
}

export const HexBoard = memo(function HexBoard({ view, meId, onTap, disabled }: Props) {
  const { width } = useWindowDimensions();
  const motion = useMotionEnabled();
  const chart = useRef<ElementRef<typeof ScrollView>>(null);
  const previousIsland = useRef(view.island.id);
  const r = view.island.radius;
  // Keep a full 48 dp touch target, even on smaller phones. The chart pans horizontally.
  const w = 50;
  const size = w / Math.sqrt(3);
  const d = w - 3;
  const tileH = size * 2;
  const boardW = w * (2 * r + 1);
  const boardH = size * (1.5 * 2 * r + 2);
  const viewportW = Math.min(width - 48, boardW + 16);
  const me = view.explorer.pos;
  const { x: meX, y: meY } = toPixel(parseKey(me), size);
  const playerX = boardW / 2 + meX - 21;
  const playerY = boardH / 2 + meY - 21;
  const [player] = useState(() => new Animated.ValueXY({ x: playerX, y: playerY }));
  const [tap, setTap] = useState<{ k: HexKey; sequence: number } | null>(null);
  const mates = new Map(view.crewmates.filter((m) => m.userId !== meId).map((m) => [m.pos, m]));
  const bossSprite = BOSS_SPRITE[view.boss.key] ?? 'b_octopus';
  const cameraX = Math.max(0, Math.min(boardW + 16 - viewportW, boardW / 2 + meX + 8 - viewportW / 2));

  useEffect(() => {
    const destination = { x: playerX, y: playerY };
    const sameIsland = previousIsland.current === view.island.id;
    previousIsland.current = view.island.id;
    if (!motion || !sameIsland) {
      player.setValue(destination);
      return;
    }
    const travel = Animated.spring(player, { toValue: destination, stiffness: 110, damping: 19, mass: 1, useNativeDriver: true });
    travel.start();
    return () => travel.stop();
  }, [motion, player, playerX, playerY, view.island.id]);

  useEffect(() => {
    chart.current?.scrollTo({ x: cameraX, animated: motion });
  }, [cameraX, motion]);

  return (
    <View style={[s.board, { width: viewportW }]}>
      <View style={s.chartHeader}>
        <View style={{ gap: 3 }}>
          <Text style={s.eyebrow}>ISLAND CHART</Text>
          <Text style={s.hint}>Drag to explore · brass marks your route</Text>
        </View>
        <Sprite name="compass" size={30} />
      </View>
      <ScrollView
        ref={chart}
        horizontal
        nestedScrollEnabled
        showsHorizontalScrollIndicator
        indicatorStyle="white"
        contentOffset={{ x: cameraX, y: 0 }}
        contentContainerStyle={{ padding: 8 }}
        style={{ height: boardH + 16, flexGrow: 0 }}
      >
        <View style={{ width: boardW, height: boardH }}>
          {view.island.allHexes.map((k) => {
            const h = parseKey(k);
            const { x, y } = toPixel(h, size);
            const tile = view.island.tiles[k];
            const edge = distance(h, { q: 0, r: 0 }) === r;
            const isBoss = k === view.island.bossAt;
            const isMe = k === me;
            const cost = view.reachable[k];
            const terrain: Terrain | null = tile?.terrain ?? (edge ? 'sea' : null);
            const bg = isBoss ? (view.boss.defeated ? '#3BA991' : '#466AB0') : terrain ? TERRAIN_COLOR[terrain] : '#245A87';
            const reachable = cost !== undefined;
            const tappable = reachable && !disabled;
            const item = tile?.item ? ITEM_SPRITE[tile.item] : undefined;
            const mate = mates.get(k);
            return (
              <Pressable
                key={k}
                disabled={!tappable}
                accessibilityRole="button"
                accessibilityLabel={`${isMe ? 'Your position, ' : ''}${isBoss ? view.boss.name : terrain ?? 'Unexplored'}${reachable ? `, ${cost} Moves` : ''}${tile?.item ? `, ${tile.item}` : ''}`}
                accessibilityState={{ disabled: !tappable, selected: isMe }}
                onPress={tappable ? () => {
                  setTap((previous) => ({ k, sequence: (previous?.sequence ?? 0) + 1 }));
                  Haptics.selectionAsync().catch(() => {});
                  onTap(k);
                } : undefined}
                style={({ pressed }) => [
                  s.hex,
                  {
                    width: w,
                    height: tileH,
                    left: boardW / 2 + x - w / 2,
                    top: boardH / 2 + y - tileH / 2,
                    opacity: terrain === 'sea' ? 0.8 : 1,
                    transform: [{ scale: pressed && motion ? 0.91 : 1 }],
                  },
                ]}
              >
                <HexSurface width={d} color={isMe || reachable ? C.gold : terrain ? '#83BAD5' : '#3D78A3'} />
                <HexSurface width={d - (isMe || reachable ? 3 : 1.5)} color={bg} />
                {isBoss ? (
                  <Float amplitude={2} tilt={2} duration={2600}>
                    <Sprite name={view.boss.defeated ? 't_flag' : bossSprite} size={d * 0.97} />
                  </Float>
                ) : isMe ? null : mate ? (
                  <View style={[s.token, { width: 34, height: 34, borderColor: C.sky }]}>
                    <PlayerAvatar userId={mate.userId} avatarId={mate.avatarId} size={34} />
                  </View>
                ) : tile?.item ? (
                  <Sprite name={item ?? 'chest'} size={d * 0.72} />
                ) : reachable ? (
                  <Text style={[s.cost, { color: terrain === 'jungle' || !terrain ? C.cloud : C.ink }]}>{cost}</Text>
                ) : !terrain ? (
                  <View style={s.fogDot} />
                ) : terrain === 'sea' ? (
                  <Text style={s.wave}>~</Text>
                ) : null}
              </Pressable>
            );
          })}
          {tap ? <ChartRipple key={tap.sequence} enabled={motion}
            x={boardW / 2 + toPixel(parseKey(tap.k), size).x}
            y={boardH / 2 + toPixel(parseKey(tap.k), size).y} /> : null}
          <Animated.View
            pointerEvents="none"
            style={[s.player, { opacity: view.explorer.hp > 0 ? 1 : 0.5, transform: player.getTranslateTransform() }]}
          >
            <View style={s.playerShadow} />
            <Float amplitude={3} tilt={5} duration={2300}>
              <View style={[s.token, { width: 42, height: 42, borderColor: C.gold }]}>
                <PlayerAvatar userId={meId} size={42} />
              </View>
            </Float>
          </Animated.View>
        </View>
      </ScrollView>
      <View style={s.chartFooter}>
        <View style={s.keyDot} />
        <Text style={s.hint}>You</Text>
        <View style={[s.keyDot, { backgroundColor: C.sky, marginLeft: 12 }]} />
        <Text style={s.hint}>Crew</Text>
        <Text style={[s.hint, { marginLeft: 'auto' }]}>{disabled ? 'Awaiting the tide' : 'Tap a tile to sail onward'}</Text>
      </View>
    </View>
  );
});

const s = StyleSheet.create({
  board: { alignSelf: 'center', backgroundColor: C.deep, borderRadius: 20, borderWidth: 1, borderColor: '#438DBB', overflow: 'hidden' },
  chartHeader: { padding: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: '#397BAA' },
  eyebrow: { fontFamily: F.bodyBold, color: C.gold, fontSize: 10, letterSpacing: 2 },
  hint: { fontFamily: F.body, color: C.dimLight, fontSize: 11, lineHeight: 16 },
  chartFooter: { paddingHorizontal: 14, paddingVertical: 12, flexDirection: 'row', gap: 5, alignItems: 'center', borderTopWidth: 1, borderTopColor: '#397BAA', flexWrap: 'wrap' },
  keyDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: C.gold },
  hex: { position: 'absolute', alignItems: 'center', justifyContent: 'center', overflow: 'visible' },
  token: { backgroundColor: C.paper, borderWidth: 1.5, borderRadius: 30, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  player: { position: 'absolute', left: 0, top: 0, width: 42, height: 42 },
  playerShadow: { position: 'absolute', bottom: -3, left: 7, width: 28, height: 7, borderRadius: 20, backgroundColor: '#00000050' },
  cost: { fontFamily: F.bodyBold, fontSize: 15 },
  tapRipple: { position: 'absolute', width: 46, height: 46, borderRadius: 23, borderWidth: 2, borderColor: C.gold },
  fogDot: { width: 3, height: 3, borderRadius: 2, backgroundColor: '#8CB9D8' },
  wave: { color: C.sky, fontSize: 22, opacity: 0.35, fontFamily: F.title },
});

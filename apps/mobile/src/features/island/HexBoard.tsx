/**
 * Hex board: pointy-top axial grid. Terrain is colour (no terrain art yet); items, boss and
 * pirates use approved sprites. Positions/tap logic come from @last-voyage/game.
 */
import { distance, parseKey, toPixel, type HexKey, type Terrain } from '@last-voyage/game';
import { memo, useEffect, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';

import { C, F } from '@/components/kit';
import { avatarFor, BOSS_SPRITE, ITEM_SPRITE, Sprite } from '@/components/sprites';
import type { IslandView } from '@/lib/types';
import { ITEM_GLYPH } from '@/state/island';

export const TERRAIN_COLOR: Record<Terrain, string> = {
  sea: '#33A6FF',
  beach: '#FFE3A3',
  grass: '#8EDC7A',
  jungle: '#2FAE6E',
  rock: '#9C9AC4',
  ruins: '#D9C7A6',
  town: '#FFB45C',
  swamp: '#6E8F5A',
  volcano: '#FF4542',
  snow: '#FFFFFF',
};

type Props = {
  view: IslandView;
  meId: string;
  onTap: (k: HexKey) => void;
  disabled?: boolean;
  highlightHex?: string | null;
};

export const HexBoard = memo(function HexBoard({ view, meId, onTap, disabled, highlightHex }: Props) {
  const { width } = useWindowDimensions();
  const [glow] = useState(() => new Animated.Value(0.35));
  const r = view.island.radius;
  const size = (width - 24) / (Math.sqrt(3) * (2 * r + 1));
  const w = Math.sqrt(3) * size;
  const boardW = w * (2 * r + 1);
  const boardH = size * 1.5 * (2 * r) + size * 2;
  const me = view.explorer.pos;
  const mates = new Map(view.crewmates.map((m) => [m.pos, m]));
  const bossSprite = BOSS_SPRITE[view.boss.key] ?? 'b_octopus';

  useEffect(() => {
    if (!highlightHex) {
      glow.setValue(0.35);
      return;
    }
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(glow, { toValue: 1, duration: 520, useNativeDriver: true }),
        Animated.timing(glow, { toValue: 0.3, duration: 520, useNativeDriver: true }),
      ]),
    );
    pulse.start();
    return () => pulse.stop();
  }, [glow, highlightHex]);

  return (
    <View style={[s.board, { width: boardW + 12, height: boardH + 12 }]}>
      <View style={{ width: boardW, height: boardH }}>
        {view.island.allHexes.map((k) => {
          const h = parseKey(k);
          const { x, y } = toPixel(h, size);
          const tile = view.island.tiles[k];
          const edge = distance(h, { q: 0, r: 0 }) === r;
          const isBoss = k === view.island.bossAt;
          const cost = view.reachable[k];
          const terrain: Terrain | null = tile?.terrain ?? (edge ? 'sea' : null);
          const bg = isBoss ? (view.boss.defeated ? C.green : C.navy) : terrain ? TERRAIN_COLOR[terrain] : C.fog;
          const tappable = cost !== undefined && !disabled;
          const d = w * 0.94;
          const item = tile?.item ? ITEM_SPRITE[tile.item] : undefined;
          const mate = mates.get(k);
          return (
            <Pressable
              key={k}
              onPress={tappable ? () => onTap(k) : undefined}
              style={[
                s.hex,
                {
                  width: d,
                  height: d,
                  borderRadius: d * 0.3,
                  left: boardW / 2 + x - d / 2,
                  top: boardH / 2 + y - d / 2,
                  backgroundColor: bg,
                  borderColor: tappable ? '#C8963E' : terrain === 'sea' ? 'transparent' : '#65583E',
                  borderWidth: tappable ? 3 : terrain === 'sea' ? 0 : 2,
                  opacity: terrain === 'sea' ? 0.45 : 1,
                  ...(k === highlightHex && {
                    shadowColor: '#FFD36A',
                    shadowOpacity: 0.95,
                    shadowRadius: 12,
                    elevation: 10,
                  }),
                },
              ]}
            >
              {isBoss ? (
                view.boss.defeated ? (
                  <Sprite name="t_flag" size={d * 0.9} />
                ) : (
                  <Sprite name={bossSprite} size={d * 1.25} />
                )
              ) : k === me ? (
                <View style={[s.token, { width: d * 0.95, height: d * 0.95, borderRadius: d }]}>
                  <Sprite name={avatarFor(meId)} size={d * 0.95} />
                </View>
              ) : mate ? (
                <View style={[s.token, { width: d * 0.85, height: d * 0.85, borderRadius: d, borderColor: C.sky }]}>
                  <Sprite name={avatarFor(mate.userId)} size={d * 0.85} />
                </View>
              ) : tile?.item ? (
                item ? (
                  <Sprite name={item} size={d * 0.78} />
                ) : (
                  <Text style={{ fontSize: d * 0.45 }}>{ITEM_GLYPH[tile.item] ?? '✨'}</Text>
                )
              ) : tappable ? (
                <Text style={[s.cost, { fontSize: d * 0.38 }]}>{cost}</Text>
              ) : !terrain ? (
                <Text style={[s.fog, { fontSize: d * 0.4 }]}>?</Text>
              ) : null}
              {k === highlightHex ? (
                <Animated.View
                  pointerEvents="none"
                  style={[
                    s.glow,
                    {
                      borderRadius: d * 0.3,
                      opacity: glow,
                      transform: [{ scale: 1.12 }],
                    },
                  ]}
                />
              ) : null}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
});

const s = StyleSheet.create({
  board: { alignSelf: 'center', alignItems: 'center', justifyContent: 'center', backgroundColor: '#0D1B2A', borderRadius: 24, borderWidth: 2, borderColor: '#C8963E' },
  hex: { position: 'absolute', alignItems: 'center', justifyContent: 'center', overflow: 'visible' },
  glow: { ...StyleSheet.absoluteFill, borderWidth: 3, borderColor: '#FFD36A', backgroundColor: 'rgba(255, 211, 106, 0.12)' },
  token: { backgroundColor: C.cloud, borderWidth: 2, borderColor: C.orange, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  cost: { fontFamily: F.ui, color: C.ink },
  fog: { fontFamily: F.ui, color: C.peri, opacity: 0.6 },
});

/**
 * PLACEHOLDER hex board: circles + emoji on a pointy-top hex grid. Swap the tile View for
 * approved sprites (hex_<terrain>.png) once they exist; positions/tap logic stay the same.
 */
import { distance, parseKey, toPixel, type HexKey, type Terrain } from '@last-voyage/game';
import { memo } from 'react';
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';

import { C, F } from '@/components/kit';
import type { IslandView } from '@/lib/types';
import { ITEM_GLYPH } from '@/state/island';

export const TERRAIN_COLOR: Record<Terrain, string> = {
  sea: '#4FC3F7',
  beach: '#F6E1A6',
  grass: '#9ED36A',
  jungle: '#3E9B5A',
  rock: '#A39C92',
  ruins: '#C9B79C',
  town: '#E8A15A',
  swamp: '#6F7F4F',
  volcano: '#B5452F',
  snow: '#EEF4F7',
};

type Props = {
  view: IslandView;
  onTap: (k: HexKey) => void;
  disabled?: boolean;
};

export const HexBoard = memo(function HexBoard({ view, onTap, disabled }: Props) {
  const { width } = useWindowDimensions();
  const r = view.island.radius;
  const size = (width - 24) / (Math.sqrt(3) * (2 * r + 1));
  const w = Math.sqrt(3) * size;
  const boardW = w * (2 * r + 1);
  const boardH = size * 1.5 * (2 * r) + size * 2;
  const me = view.explorer.pos;
  const mates = new Map(view.crewmates.map((m) => [m.pos, m.name]));

  return (
    <View style={{ width: boardW, height: boardH, alignSelf: 'center' }}>
      {view.island.allHexes.map((k) => {
        const h = parseKey(k);
        const { x, y } = toPixel(h, size);
        const tile = view.island.tiles[k];
        const edge = distance(h, { q: 0, r: 0 }) === r;
        const isBoss = k === view.island.bossAt;
        const cost = view.reachable[k];
        const terrain: Terrain | null = tile?.terrain ?? (edge ? 'sea' : null);
        const bg = isBoss ? (view.boss.defeated ? C.jungle : C.red) : terrain ? TERRAIN_COLOR[terrain] : C.fog;
        const tappable = cost !== undefined && !disabled;
        const d = w * 0.92;
        return (
          <Pressable
            key={k}
            onPress={tappable ? () => onTap(k) : undefined}
            style={[
              s.hex,
              {
                width: d,
                height: d,
                borderRadius: d / 2,
                left: boardW / 2 + x - d / 2,
                top: boardH / 2 + y - d / 2,
                backgroundColor: bg,
                borderColor: tappable ? C.sun : terrain === 'sea' ? 'transparent' : C.ink,
                borderWidth: tappable ? 3 : terrain === 'sea' ? 0 : 1.5,
                opacity: terrain === 'sea' ? 0.55 : 1,
              },
            ]}
          >
            {isBoss ? (
              <Text style={{ fontSize: d * 0.55 }}>{view.boss.defeated ? '🚩' : '👹'}</Text>
            ) : k === me ? (
              <View style={[s.token, { width: d * 0.7, height: d * 0.7, borderRadius: d }]}>
                <Text style={[s.tokenText, { fontSize: d * 0.36 }]}>★</Text>
              </View>
            ) : mates.has(k) ? (
              <View style={[s.token, { width: d * 0.62, height: d * 0.62, borderRadius: d, backgroundColor: C.seaLight }]}>
                <Text style={[s.tokenText, { fontSize: d * 0.3 }]}>{mates.get(k)!.slice(0, 1).toUpperCase()}</Text>
              </View>
            ) : tile?.item ? (
              <Text style={{ fontSize: d * 0.45 }}>{ITEM_GLYPH[tile.item] ?? '✨'}</Text>
            ) : tappable ? (
              <Text style={[s.cost, { fontSize: d * 0.34 }]}>{cost}</Text>
            ) : !terrain ? (
              <Text style={{ fontSize: d * 0.35, opacity: 0.5 }}>☁️</Text>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
});

const s = StyleSheet.create({
  hex: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  token: { backgroundColor: C.sun, borderWidth: 2, borderColor: C.ink, alignItems: 'center', justifyContent: 'center' },
  tokenText: { fontFamily: F.ui, color: C.ink },
  cost: { fontFamily: F.ui, color: C.ink },
});

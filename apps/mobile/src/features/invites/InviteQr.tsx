import { LocalizedText as Text } from '@/features/language/LocalizedText';
import { useMemo } from 'react';
import { View } from 'react-native';

import { qrMatrix } from './qr';

/** Four-module white quiet zone and integer display pixels keep the QR camera-readable. */
export function InviteQr({ value, size = 256 }: { value: string; size?: number }) {
  const result = useMemo(() => {
    try { return { matrix: qrMatrix(value) }; }
    catch (error) { return { error: error instanceof Error ? error.message : 'Share the invite link or code below.' }; }
  }, [value]);
  const matrix = result.matrix;
  if (!matrix) return <Text style={{ color: '#123B5D' }}>{result.error}</Text>;
  const unit = Math.max(2, Math.floor(size / (matrix.length + 8)));
  const edge = (matrix.length + 8) * unit;
  return <View accessibilityRole="image" accessibilityLabel="Crew invitation QR code. Scan with your phone camera or use the invite code below."
    style={{ width: edge, height: edge, backgroundColor: '#FFFFFF' }}>
    {matrix.flatMap((row, y) => {
      const runs = [];
      for (let x = 0; x < row.length; x++) {
        if (!row[x]) continue;
        const start = x;
        while (x + 1 < row.length && row[x + 1]) x++;
        runs.push(<View key={`${y}-${start}`} style={{ position: 'absolute', top: (y + 4) * unit, left: (start + 4) * unit, width: (x - start + 1) * unit, height: unit, backgroundColor: '#000000' }} />);
      }
      return runs;
    })}
  </View>;
}

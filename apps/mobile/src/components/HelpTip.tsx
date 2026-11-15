/** A small "?" that opens a short explanation. Tap anywhere to close. */
import { useState, type ReactNode } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { C, F, H, P } from '@/components/kit';

export function HelpTip({ title, children, label }: { title: string; children: ReactNode; label?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Pressable accessibilityRole="button" accessibilityLabel={label ?? `What is ${title}?`} hitSlop={10} onPress={() => setOpen(true)} style={s.dot}>
        <Text style={s.q}>?</Text>
      </Pressable>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={s.scrim} onPress={() => setOpen(false)} accessibilityRole="button" accessibilityLabel="Close help">
          <Pressable style={s.card} onPress={() => {}}>
            <H color={C.ink}>{title}</H>
            <View style={{ gap: 8 }}>{children}</View>
            <Pressable accessibilityRole="button" onPress={() => setOpen(false)} style={s.close}>
              <Text style={s.closeText}>Got it</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

/** A plain line inside a HelpTip (dark text on the light card). */
export function HelpLine({ children }: { children: ReactNode }) {
  return <P color={C.ink}>{children}</P>;
}

const s = StyleSheet.create({
  dot: { width: 24, height: 24, borderRadius: 12, borderWidth: 1.5, borderColor: C.gold, alignItems: 'center', justifyContent: 'center' },
  q: { fontFamily: F.ui, fontSize: 14, color: C.gold, lineHeight: 18 },
  scrim: { flex: 1, backgroundColor: '#031E36B3', alignItems: 'center', justifyContent: 'center', padding: 24 },
  card: { width: '100%', maxWidth: 420, backgroundColor: C.cloud, borderRadius: 18, padding: 20, gap: 12, borderWidth: 1, borderColor: '#ECDCB9' },
  close: { alignSelf: 'flex-end', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 12, backgroundColor: C.navy },
  closeText: { fontFamily: F.bodyBold, color: C.cloud, fontSize: 14 },
});

/** Temporary home: replaced by the Ship screen once onboarding and tabs land. */
import { Link } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

export default function Home() {
  return (
    <View style={s.screen}>
      <Text style={s.title}>THE LAST VOYAGE</Text>
      <Text style={s.sub}>Go live. The sea will wait.</Text>
      <Link href="/dev/scroll-lab" asChild>
        <Pressable style={s.btn}>
          <Text style={s.btnText}>Scroll Lab</Text>
        </Pressable>
      </Link>
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, backgroundColor: '#FFF6E3' },
  title: { fontFamily: 'Bangers_400Regular', fontSize: 48, color: '#141414', letterSpacing: 1 },
  sub: { fontFamily: 'Nunito_600SemiBold', fontSize: 16, color: '#141414' },
  btn: { borderWidth: 3, borderColor: '#141414', backgroundColor: '#FFC72C', paddingVertical: 12, paddingHorizontal: 28 },
  btnText: { fontFamily: 'Baloo2_800ExtraBold', fontSize: 18, color: '#141414' },
});

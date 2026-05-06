import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import IslamicPattern from './IslamicPattern';
import { theme } from '../theme';

const HIJRI_MONTHS = [
  'Muharram', 'Safar', 'Rabi‘ I', 'Rabi‘ II', 'Jumada I', 'Jumada II',
  'Rajab', 'Sha‘ban', 'Ramadan', 'Shawwal', 'Dhu al-Qi‘dah', 'Dhu al-Hijjah',
];

// Approximate Hijri date (Umm al-Qura tabular). Good enough for a header chip;
// the salah times themselves come from the mosque website.
function approxHijri(date = new Date()) {
  const jd = Math.floor(date.getTime() / 86400000) + 2440588;
  const i = jd - 1948440 + 10632;
  const n = Math.floor((i - 1) / 10631);
  const j = i - 10631 * n + 354;
  const k =
    Math.floor((10985 - j) / 5316) * Math.floor((50 * j) / 17719) +
    Math.floor(j / 5670) * Math.floor((43 * j) / 15238);
  const l = j - Math.floor((30 - k) / 15) * Math.floor((17719 * k) / 50) -
    Math.floor(k / 16) * Math.floor((15238 * k) / 43) + 29;
  const month = Math.floor((24 * l) / 709);
  const day = l - Math.floor((709 * month) / 24);
  const year = 30 * n + k - 30;
  return { day, month: HIJRI_MONTHS[Math.max(0, Math.min(11, month - 1))], year };
}

export default function HeaderHero({ subtitle }) {
  const today = new Date();
  const greg = today.toLocaleDateString(undefined, {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  const hijri = approxHijri(today);

  return (
    <View style={styles.wrap}>
      <View style={styles.patternLayer} pointerEvents="none">
        <IslamicPattern color="#E9D8A6" opacity={0.18} height={220} />
      </View>
      <Text style={styles.assalam}>{'As-salamu ʻalaykum'}</Text>
      <Text style={styles.title}>Find your nearest mosque</Text>
      {!!subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
      <View style={styles.dateRow}>
        <View style={styles.dateChip}>
          <Text style={styles.dateChipText}>{greg}</Text>
        </View>
        <View style={[styles.dateChip, styles.dateChipGold]}>
          <Text style={[styles.dateChipText, { color: theme.colors.primaryDark }]}>
            {hijri.day} {hijri.month} {hijri.year} AH
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: theme.colors.primary,
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 28,
    overflow: 'hidden',
  },
  patternLayer: { ...StyleSheet.absoluteFillObject },
  assalam: { ...theme.typography.caption, color: theme.colors.accentSoft, letterSpacing: 1, textTransform: 'uppercase' },
  title: { ...theme.typography.display, color: '#fff', marginTop: 6 },
  subtitle: { ...theme.typography.body, color: theme.colors.accentSoft, marginTop: 6 },
  dateRow: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 14 },
  dateChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: theme.radii.pill,
    backgroundColor: 'rgba(255,255,255,0.12)',
    marginRight: 8,
    marginTop: 6,
  },
  dateChipGold: { backgroundColor: theme.colors.accent },
  dateChipText: { ...theme.typography.caption, color: '#fff', fontWeight: '600' },
});

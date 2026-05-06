import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { theme } from '../theme';

function MosqueIcon({ color = theme.colors.primary, size = 28 }) {
  return (
    <View style={[styles.iconWrap, { width: size + 18, height: size + 18, backgroundColor: theme.colors.surfaceAlt }]}>
      <Text style={{ fontSize: size, color }}>{'\u{1F54C}'}</Text>
    </View>
  );
}

export default function MosqueCard({ mosque, onPress, highlight = false }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        highlight && styles.highlight,
        pressed && { transform: [{ scale: 0.98 }] },
      ]}
    >
      <MosqueIcon color={highlight ? theme.colors.accent : theme.colors.primary} />
      <View style={styles.body}>
        <Text style={styles.name} numberOfLines={1}>
          {mosque.name}
        </Text>
        {!!mosque.address && (
          <Text style={styles.addr} numberOfLines={2}>
            {mosque.address}
          </Text>
        )}
        <View style={styles.metaRow}>
          {typeof mosque.distance === 'number' && (
            <View style={styles.pill}>
              <Text style={styles.pillText}>{formatDistance(mosque.distance)}</Text>
            </View>
          )}
          {mosque.openNow === true && (
            <View style={[styles.pill, styles.pillSuccess]}>
              <Text style={[styles.pillText, { color: '#fff' }]}>Open now</Text>
            </View>
          )}
          {!!mosque.rating && (
            <View style={[styles.pill, styles.pillGold]}>
              <Text style={[styles.pillText, { color: theme.colors.primaryDark }]}>
                {'★'} {mosque.rating.toFixed(1)}
              </Text>
            </View>
          )}
        </View>
      </View>
      <Text style={styles.chevron}>{'›'}</Text>
    </Pressable>
  );
}

function formatDistance(meters) {
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(meters < 10000 ? 1 : 0)} km`;
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radii.md,
    padding: 14,
    marginVertical: 6,
    ...theme.shadow.card,
  },
  highlight: {
    borderWidth: 1.5,
    borderColor: theme.colors.accent,
    backgroundColor: '#FFFDF6',
  },
  iconWrap: {
    borderRadius: theme.radii.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  body: { flex: 1 },
  name: { ...theme.typography.subtitle, color: theme.colors.text },
  addr: { ...theme.typography.caption, color: theme.colors.textMuted, marginTop: 2 },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 8 },
  pill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: theme.radii.pill,
    backgroundColor: theme.colors.surfaceAlt,
    marginRight: 6,
    marginTop: 4,
  },
  pillSuccess: { backgroundColor: theme.colors.success },
  pillGold: { backgroundColor: theme.colors.accentSoft },
  pillText: { ...theme.typography.caption, color: theme.colors.text },
  chevron: { fontSize: 24, color: theme.colors.textMuted, marginLeft: 6 },
});

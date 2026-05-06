import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { theme } from '../theme';

const ORDER = ['Fajr', 'Sunrise', 'Dhuhr', 'Asr', 'Maghrib', 'Isha', 'Jummah'];

export default function SalahTimeCard({ times, highlight }) {
  const rows = ORDER.filter((k) => times && times[k]);
  if (rows.length === 0) {
    return null;
  }
  return (
    <View style={styles.wrap}>
      {rows.map((name, idx) => {
        const isHighlighted = highlight === name;
        return (
          <View
            key={name}
            style={[
              styles.row,
              idx !== rows.length - 1 && styles.rowDivider,
              isHighlighted && styles.rowHighlight,
            ]}
          >
            <Text style={[styles.name, isHighlighted && styles.nameHighlight]}>{name}</Text>
            <Text style={[styles.time, isHighlighted && styles.timeHighlight]}>
              {times[name]}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radii.lg,
    paddingHorizontal: 16,
    paddingVertical: 8,
    ...theme.shadow.card,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
  },
  rowDivider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.divider,
  },
  rowHighlight: {
    marginHorizontal: -8,
    paddingHorizontal: 12,
    backgroundColor: theme.colors.accentSoft,
    borderRadius: theme.radii.md,
    borderBottomWidth: 0,
  },
  name: { ...theme.typography.subtitle, color: theme.colors.text },
  nameHighlight: { color: theme.colors.primaryDark },
  time: { ...theme.typography.salahLarge, color: theme.colors.primary },
  timeHighlight: { color: theme.colors.primaryDark },
});

import React from 'react';
import { View, Text, Pressable, StyleSheet, Linking, Platform } from 'react-native';
import { theme } from '../theme';
import { classifyWebsite } from '../services/websiteClassify';

function MosqueIcon({ color = theme.colors.primary, size = 28 }) {
  return (
    <View
      style={[
        styles.iconWrap,
        {
          width: size + 18,
          height: size + 18,
          backgroundColor: theme.colors.surfaceAlt,
        },
      ]}
    >
      <Text style={{ fontSize: size, color }}>{'\u{1F54C}'}</Text>
    </View>
  );
}

export default function MosqueCard({ mosque, onPress, highlight = false }) {
  const site = classifyWebsite(mosque.website);
  const hasPhone = !!mosque.phone;
  const hasUsableLink = site.kind !== 'none' && site.kind !== 'invalid';
  const hasLocation = !!(mosque.location?.latitude && mosque.location?.longitude);
  const showActions = hasPhone || hasUsableLink || hasLocation;

  return (
    <View style={[styles.card, highlight && styles.highlight]}>
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [styles.mainRow, pressed && { opacity: 0.85 }]}
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
          {hasPhone && (
            <Text style={styles.contact} numberOfLines={1}>
              {'\u{1F4DE}'} {mosque.phone}
            </Text>
          )}
          {hasUsableLink && (
            <Text
              style={[
                styles.contact,
                site.kind === 'website' ? styles.contactLink : styles.contactSocial,
              ]}
              numberOfLines={1}
            >
              {site.icon} {site.kind === 'website' ? site.host : `${site.label} · ${site.host}`}
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
                  {!!mosque.ratingsTotal && ` (${mosque.ratingsTotal})`}
                </Text>
              </View>
            )}
          </View>
        </View>
        <Text style={styles.chevron}>{'›'}</Text>
      </Pressable>

      {showActions && (
        <View style={styles.actionsRow}>
          <ActionBtn
            icon={'\u{1F4DE}'}
            label="Call"
            enabled={hasPhone}
            onPress={() => hasPhone && openTel(mosque.phone)}
          />
          <View style={styles.actionDivider} />
          <ActionBtn
            icon={hasUsableLink ? site.icon : '\u{1F310}'}
            label={hasUsableLink ? site.label : 'Website'}
            enabled={hasUsableLink}
            onPress={() => hasUsableLink && openUrl(site.url)}
          />
          <View style={styles.actionDivider} />
          <ActionBtn
            icon={'\u{1F4CD}'}
            label="Directions"
            enabled={hasLocation}
            onPress={() => hasLocation && openDirections(mosque)}
          />
        </View>
      )}
    </View>
  );
}

function ActionBtn({ icon, label, enabled, onPress }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={!enabled}
      style={({ pressed }) => [
        styles.action,
        pressed && enabled && { backgroundColor: theme.colors.surfaceAlt },
      ]}
    >
      <Text style={[styles.actionIcon, !enabled && styles.actionDim]}>{icon}</Text>
      <Text style={[styles.actionLabel, !enabled && styles.actionDim]}>{label}</Text>
    </Pressable>
  );
}

function openUrl(url) {
  Linking.openURL(url).catch(() => {});
}
function openTel(phone) {
  const tel = String(phone).replace(/[^+\d]/g, '');
  Linking.openURL(`tel:${tel}`).catch(() => {});
}
function openDirections(mosque) {
  const lat = mosque.location?.latitude;
  const lng = mosque.location?.longitude;
  if (lat == null || lng == null) return;
  const label = encodeURIComponent(mosque.name || 'Mosque');
  const url = Platform.select({
    ios: `http://maps.apple.com/?q=${label}&ll=${lat},${lng}`,
    android: `geo:${lat},${lng}?q=${lat},${lng}(${label})`,
    default: `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`,
  });
  Linking.openURL(url).catch(() => {});
}

function formatDistance(meters) {
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(meters < 10000 ? 1 : 0)} km`;
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radii.md,
    marginVertical: 6,
    overflow: 'hidden',
    ...theme.shadow.card,
  },
  highlight: {
    borderWidth: 1.5,
    borderColor: theme.colors.accent,
    backgroundColor: '#FFFDF6',
  },
  mainRow: { flexDirection: 'row', alignItems: 'center', padding: 14 },
  iconWrap: {
    borderRadius: theme.radii.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  body: { flex: 1 },
  name: { ...theme.typography.subtitle, color: theme.colors.text },
  addr: { ...theme.typography.caption, color: theme.colors.textMuted, marginTop: 2 },
  contact: {
    ...theme.typography.caption,
    color: theme.colors.text,
    marginTop: 4,
    fontWeight: '500',
  },
  contactLink: { color: theme.colors.primary },
  contactSocial: { color: theme.colors.textMuted, fontStyle: 'italic' },
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

  actionsRow: {
    flexDirection: 'row',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: theme.colors.divider,
  },
  action: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 11,
    gap: 6,
  },
  actionDivider: {
    width: StyleSheet.hairlineWidth,
    backgroundColor: theme.colors.divider,
  },
  actionIcon: { fontSize: 14 },
  actionLabel: {
    ...theme.typography.caption,
    color: theme.colors.primary,
    fontWeight: '600',
  },
  actionDim: { color: theme.colors.textMuted, opacity: 0.55 },
});

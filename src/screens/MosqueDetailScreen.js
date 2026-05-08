import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Pressable,
  Linking,
  Platform,
} from 'react-native';
import * as Haptics from 'expo-haptics';

import SalahTimeCard from '../components/SalahTimeCard';
import RefreshButton from '../components/RefreshButton';
import { theme } from '../theme';
import { getMosqueDetails } from '../services/places';
import { fetchSalahTimes } from '../services/salahScraper';

export default function MosqueDetailScreen({ route, navigation }) {
  const { mosque } = route.params;

  const [details, setDetails] = useState(null);
  const [loadingDetails, setLoadingDetails] = useState(true);

  const [salah, setSalah] = useState(null);
  const [salahLoading, setSalahLoading] = useState(false);
  const [salahError, setSalahError] = useState(null);

  const coords = useMemo(
    () => details?.location || mosque.location || null,
    [details, mosque]
  );

  const loadFromWebsite = useCallback(async (websiteUrl) => {
    setSalahLoading(true);
    setSalahError(null);
    try {
      const result = await fetchSalahTimes(websiteUrl);
      if (Object.keys(result.times || {}).length === 0) {
        setSalahError(
          "We reached the mosque's website but couldn't find a prayer-times section we recognise."
        );
        setSalah(null);
      } else {
        setSalah(result);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      }
    } catch (e) {
      setSalahError(e.message);
      setSalah(null);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
    } finally {
      setSalahLoading(false);
    }
  }, []);

  const loadDetailsAndTimes = useCallback(async () => {
    setLoadingDetails(true);
    setSalahError(null);
    setSalah(null);

    let resolved = null;
    if (mosque.detailsLoaded) {
      resolved = {
        name: mosque.name,
        address: mosque.address,
        phone: mosque.phone,
        website: mosque.website,
        googleMapsUrl: mosque.googleMapsUrl,
        rating: mosque.rating,
        ratingsTotal: mosque.ratingsTotal,
        openingHours: mosque.openingHours,
        location: mosque.location,
      };
    } else {
      try {
        resolved = await getMosqueDetails(mosque);
      } catch (e) {
        resolved = {
          name: mosque.name,
          address: mosque.address,
          location: mosque.location,
        };
      }
    }
    setDetails(resolved);
    if (resolved?.name) navigation.setOptions({ title: resolved.name });
    setLoadingDetails(false);

    if (!resolved.website) {
      setSalahError(
        "This mosque doesn't have a website on file, so we can't read its prayer times."
      );
      return;
    }

    await loadFromWebsite(resolved.website);
  }, [mosque, navigation, loadFromWebsite]);

  useEffect(() => { loadDetailsAndTimes(); }, [loadDetailsAndTimes]);

  const onOpenWebsite = () => {
    if (details?.website) Linking.openURL(details.website).catch(() => {});
  };
  const onOpenMaps = () => {
    const lat = coords?.latitude;
    const lng = coords?.longitude;
    if (lat == null || lng == null) return;
    const label = encodeURIComponent(details?.name || mosque.name || 'Mosque');
    const url = Platform.select({
      ios: `http://maps.apple.com/?q=${label}&ll=${lat},${lng}`,
      android: `geo:${lat},${lng}?q=${lat},${lng}(${label})`,
      default: `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`,
    });
    Linking.openURL(url).catch(() => {});
  };
  const onCall = () => {
    if (details?.phone) {
      const tel = String(details.phone).replace(/[^+\d]/g, '');
      Linking.openURL(`tel:${tel}`).catch(() => {});
    }
  };

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={{ paddingBottom: 36 }}>
      <View style={styles.hero}>
        <Text style={styles.heroEyebrow}>Selected mosque</Text>
        <Text style={styles.heroTitle}>{details?.name || mosque.name}</Text>
        {!!(details?.address || mosque.address) && (
          <Text style={styles.heroAddr}>{details?.address || mosque.address}</Text>
        )}
        <View style={styles.metaRow}>
          {!!mosque.distance && <Pill text={formatDistance(mosque.distance)} />}
          {!!details?.rating && (
            <Pill text={`★ ${details.rating.toFixed(1)} (${details.ratingsTotal || 0})`} gold />
          )}
        </View>
      </View>

      <View style={styles.actionRow}>
        <ActionBtn label="Directions" onPress={onOpenMaps} />
        <ActionBtn label="Website" onPress={onOpenWebsite} disabled={!details?.website} />
        <ActionBtn label="Call" onPress={onCall} disabled={!details?.phone} />
      </View>

      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <View style={{ flex: 1 }}>
            <Text style={styles.sectionLabel}>Prayer times</Text>
            {salah?.source && (
              <Text style={styles.sourceMicro}>
                from {prettyHost(salah.source)}
                {salah.sourceType === 'widget' && ' · prayer-times widget'}
                {salah.sourceType === 'subpath' && ' · timetable page'}
              </Text>
            )}
          </View>
          {!!details?.website && (
            <Pressable
              onPress={() => loadFromWebsite(details.website)}
              hitSlop={8}
              disabled={salahLoading}
            >
              <Text style={styles.refreshLink}>
                {salahLoading ? 'Reading…' : 'Refresh'}
              </Text>
            </Pressable>
          )}
        </View>

        {loadingDetails || salahLoading ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator color={theme.colors.primary} />
            <Text style={styles.loadingText}>
              {loadingDetails
                ? 'Loading mosque details…'
                : `Reading prayer times from ${prettyHost(details?.website || '')}…`}
            </Text>
          </View>
        ) : salah ? (
          <View>
            <SalahTimeCard times={salah.times} highlight={nextPrayerKey(salah.times)} />
            {Object.keys(salah.iqamah || {}).length > 0 && (
              <View style={{ marginTop: 14 }}>
                <Text style={styles.sectionLabel}>Iqamah / Jamaat</Text>
                <SalahTimeCard times={salah.iqamah} />
              </View>
            )}
            <Text style={styles.sourceMicro}>
              Confidence: {salah.confidence}. Times are extracted directly from the mosque's website — tap "Website" above to verify.
            </Text>
          </View>
        ) : (
          <View style={styles.emptyBox}>
            <Text style={styles.emptyTitle}>No prayer times available</Text>
            <Text style={styles.emptyBody}>
              {salahError ||
                "We could not extract prayer times from this mosque's website."}
            </Text>
            {!!details?.website && (
              <View style={{ marginTop: 14, alignItems: 'center' }}>
                <RefreshButton
                  onPress={() => loadFromWebsite(details.website)}
                  loading={salahLoading}
                  label="Try again"
                />
              </View>
            )}
            {!!details?.website && (
              <Pressable onPress={onOpenWebsite} style={{ marginTop: 12, alignSelf: 'center' }}>
                <Text style={styles.linkText}>Open {prettyHost(details.website)} →</Text>
              </Pressable>
            )}
          </View>
        )}
      </View>

      {!!details?.openingHours?.length && (
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Opening hours (Google)</Text>
          <View style={styles.hoursCard}>
            {details.openingHours.map((line) => (
              <Text key={line} style={styles.hoursLine}>{line}</Text>
            ))}
          </View>
        </View>
      )}
    </ScrollView>
  );
}

// ---------------------------------------------------------------------------

function Pill({ text, gold }) {
  return (
    <View style={[pillStyles.pill, gold && pillStyles.gold]}>
      <Text style={[pillStyles.text, gold && { color: theme.colors.primaryDark }]}>{text}</Text>
    </View>
  );
}
const pillStyles = StyleSheet.create({
  pill: {
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: theme.radii.pill,
    backgroundColor: 'rgba(255,255,255,0.15)', marginRight: 8, marginTop: 6,
  },
  gold: { backgroundColor: theme.colors.accent },
  text: { ...theme.typography.caption, color: '#fff', fontWeight: '600' },
});

function ActionBtn({ label, onPress, disabled }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        actionStyles.btn,
        pressed && !disabled && { opacity: 0.85 },
        disabled && { opacity: 0.4 },
      ]}
    >
      <Text style={actionStyles.label}>{label}</Text>
    </Pressable>
  );
}
const actionStyles = StyleSheet.create({
  btn: {
    flex: 1, alignItems: 'center', paddingVertical: 12,
    backgroundColor: theme.colors.surface, borderRadius: theme.radii.md,
    marginHorizontal: 4, ...theme.shadow.card,
  },
  label: { ...theme.typography.subtitle, color: theme.colors.primary },
});

function formatDistance(meters) {
  if (meters < 1000) return `${Math.round(meters)} m away`;
  return `${(meters / 1000).toFixed(meters < 10000 ? 1 : 0)} km away`;
}
function prettyHost(url) {
  try { return new URL(url).host.replace(/^www\./, ''); } catch { return url; }
}
function nextPrayerKey(times) {
  if (!times) return null;
  const now = new Date();
  const minutesNow = now.getHours() * 60 + now.getMinutes();
  const order = ['Fajr', 'Dhuhr', 'Asr', 'Maghrib', 'Isha'];
  let best = null, bestDelta = Infinity;
  for (const name of order) {
    const m = parseTimeToMinutes(times[name]);
    if (m == null) continue;
    const delta = m - minutesNow;
    if (delta >= 0 && delta < bestDelta) { best = name; bestDelta = delta; }
  }
  return best;
}
function parseTimeToMinutes(t) {
  if (!t) return null;
  const m = /^(\d{1,2})[:.](\d{2})\s*(AM|PM)?/i.exec(t.trim());
  if (!m) return null;
  let h = parseInt(m[1], 10);
  const min = parseInt(m[2], 10);
  const mer = (m[3] || '').toUpperCase();
  if (mer === 'PM' && h < 12) h += 12;
  if (mer === 'AM' && h === 12) h = 0;
  return h * 60 + min;
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: theme.colors.background },
  hero: {
    backgroundColor: theme.colors.primary,
    paddingHorizontal: 20, paddingTop: 18, paddingBottom: 24,
  },
  heroEyebrow: {
    ...theme.typography.caption, color: theme.colors.accentSoft,
    letterSpacing: 1.2, textTransform: 'uppercase',
  },
  heroTitle: { ...theme.typography.display, color: '#fff', marginTop: 4 },
  heroAddr: { ...theme.typography.body, color: theme.colors.accentSoft, marginTop: 6 },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 8 },
  actionRow: { flexDirection: 'row', marginHorizontal: 12, marginTop: -16 },
  section: { marginHorizontal: 16, marginTop: 22 },
  sectionHeader: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'flex-start', marginBottom: 8,
  },
  sectionLabel: {
    ...theme.typography.caption, color: theme.colors.textMuted,
    textTransform: 'uppercase', letterSpacing: 1.2,
  },
  refreshLink: { ...theme.typography.subtitle, color: theme.colors.primary },
  loadingBox: { paddingVertical: 30, alignItems: 'center' },
  loadingText: { ...theme.typography.body, color: theme.colors.textMuted, marginTop: 10, textAlign: 'center', paddingHorizontal: 20 },
  emptyBox: {
    backgroundColor: theme.colors.surface, padding: 18,
    borderRadius: theme.radii.lg, ...theme.shadow.card,
  },
  emptyTitle: { ...theme.typography.title, color: theme.colors.text },
  emptyBody: { ...theme.typography.body, color: theme.colors.textMuted, marginTop: 6 },
  sourceMicro: { ...theme.typography.caption, color: theme.colors.textMuted, marginTop: 8 },
  linkText: { ...theme.typography.subtitle, color: theme.colors.primary },
  hoursCard: {
    backgroundColor: theme.colors.surface, padding: 14,
    borderRadius: theme.radii.md, ...theme.shadow.card,
  },
  hoursLine: { ...theme.typography.body, color: theme.colors.text, paddingVertical: 2 },
});

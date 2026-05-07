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
  Modal,
} from 'react-native';
import * as Haptics from 'expo-haptics';

import SalahTimeCard from '../components/SalahTimeCard';
import RefreshButton from '../components/RefreshButton';
import { theme } from '../theme';
import { getMosqueDetails } from '../services/places';
import {
  fetchPrayerTimes,
  CALCULATION_METHODS,
  ASR_SCHOOLS,
  DEFAULT_METHOD,
  DEFAULT_SCHOOL,
} from '../services/aladhan';
import { fetchSalahTimes } from '../services/salahScraper';

export default function MosqueDetailScreen({ route, navigation }) {
  const { mosque } = route.params;

  const [details, setDetails] = useState(null);
  const [loadingDetails, setLoadingDetails] = useState(true);

  const [calc, setCalc] = useState(null); // AlAdhan result
  const [calcLoading, setCalcLoading] = useState(false);
  const [calcError, setCalcError] = useState(null);

  const [method, setMethod] = useState(DEFAULT_METHOD);
  const [school, setSchool] = useState(DEFAULT_SCHOOL);
  const [showMethodPicker, setShowMethodPicker] = useState(false);

  // Optional secondary source: try to scrape the mosque website. We only
  // run this when the user explicitly asks for it.
  const [scraped, setScraped] = useState(null);
  const [scrapeLoading, setScrapeLoading] = useState(false);
  const [scrapeError, setScrapeError] = useState(null);

  const coords = useMemo(
    () =>
      details?.location ||
      mosque.location ||
      null,
    [details, mosque]
  );

  // Load Place Details (for website / phone / formatted address) — only
  // if the mosque didn't already come pre-enriched from the Home screen.
  const loadDetails = useCallback(async () => {
    if (mosque.detailsLoaded) {
      setDetails({
        name: mosque.name,
        address: mosque.address,
        phone: mosque.phone,
        website: mosque.website,
        googleMapsUrl: mosque.googleMapsUrl,
        rating: mosque.rating,
        ratingsTotal: mosque.ratingsTotal,
        openingHours: mosque.openingHours,
        location: mosque.location,
      });
      setLoadingDetails(false);
      return;
    }
    setLoadingDetails(true);
    try {
      const d = await getMosqueDetails(mosque);
      setDetails(d);
      navigation.setOptions({ title: d.name || mosque.name });
    } catch (e) {
      // Non-fatal: prayer times can still be calculated from coords.
      setDetails({
        name: mosque.name,
        address: mosque.address,
        location: mosque.location,
      });
    } finally {
      setLoadingDetails(false);
    }
  }, [mosque, navigation]);

  // Fetch calculated prayer times from AlAdhan whenever coords or
  // method/school change.
  const loadCalculated = useCallback(async () => {
    if (!coords) return;
    setCalcLoading(true);
    setCalcError(null);
    try {
      const result = await fetchPrayerTimes(coords, { method, school });
      setCalc(result);
      Haptics.selectionAsync().catch(() => {});
    } catch (e) {
      setCalcError(e.message);
    } finally {
      setCalcLoading(false);
    }
  }, [coords, method, school]);

  useEffect(() => { loadDetails(); }, [loadDetails]);
  useEffect(() => { loadCalculated(); }, [loadCalculated]);

  const onTryWebsite = useCallback(async () => {
    if (!details?.website) return;
    setScrapeLoading(true);
    setScrapeError(null);
    setScraped(null);
    try {
      const result = await fetchSalahTimes(details.website);
      if (Object.keys(result.times).length === 0) {
        setScrapeError(
          "We couldn't recognise prayer times on this mosque's website."
        );
      } else {
        setScraped(result);
      }
    } catch (e) {
      setScrapeError(e.message);
    } finally {
      setScrapeLoading(false);
    }
  }, [details?.website]);

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

      {/* PRIMARY: calculated times from AlAdhan */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <View style={{ flex: 1 }}>
            <Text style={styles.sectionLabel}>Today's prayer times</Text>
            {!!calc && (
              <Text style={styles.sourceMicro}>
                Calculated for this mosque's location · {calc.methodName}
              </Text>
            )}
          </View>
          <Pressable onPress={() => setShowMethodPicker(true)} hitSlop={8}>
            <Text style={styles.refreshLink}>Method</Text>
          </Pressable>
        </View>

        {calcLoading && !calc ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator color={theme.colors.primary} />
            <Text style={styles.loadingText}>Calculating prayer times…</Text>
          </View>
        ) : calc ? (
          <SalahTimeCard times={calc.times} highlight={nextPrayerKey(calc.times)} />
        ) : calcError ? (
          <View style={styles.emptyBox}>
            <Text style={styles.emptyTitle}>Could not calculate times</Text>
            <Text style={styles.emptyBody}>{calcError}</Text>
            <View style={{ marginTop: 14, alignItems: 'center' }}>
              <RefreshButton onPress={loadCalculated} loading={calcLoading} label="Try again" />
            </View>
          </View>
        ) : null}

        {!!calc && (
          <View style={styles.metaInfoCard}>
            <Text style={styles.metaInfoLine}>
              {calc.gregorian?.weekdayName}, {calc.gregorian?.day} {calc.gregorian?.monthName} {calc.gregorian?.year}
            </Text>
            <Text style={styles.metaInfoLine}>
              {calc.hijri?.day} {calc.hijri?.monthName} {calc.hijri?.year} AH
            </Text>
            {!!calc.timezone && (
              <Text style={styles.metaInfoMuted}>Timezone: {calc.timezone}</Text>
            )}
          </View>
        )}
      </View>

      {/* SECONDARY: cross-check with the mosque's own website */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionLabel}>Verify with mosque website</Text>
          {!!details?.website && (
            <Pressable onPress={onTryWebsite} hitSlop={8} disabled={scrapeLoading}>
              <Text style={styles.refreshLink}>
                {scrapeLoading ? 'Reading…' : scraped ? 'Refresh' : 'Read site'}
              </Text>
            </Pressable>
          )}
        </View>

        {!details?.website ? (
          <View style={styles.helperBox}>
            <Text style={styles.helperText}>
              No website is listed for this mosque, so we can't verify their published Iqamah times.
            </Text>
          </View>
        ) : scrapeLoading ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator color={theme.colors.primary} />
            <Text style={styles.loadingText}>Reading the mosque's site…</Text>
          </View>
        ) : scraped ? (
          <View>
            <SalahTimeCard times={scraped.times} />
            {Object.keys(scraped.iqamah || {}).length > 0 && (
              <View style={{ marginTop: 14 }}>
                <Text style={styles.sectionLabel}>Iqamah / Jamaat</Text>
                <SalahTimeCard times={scraped.iqamah} />
              </View>
            )}
            <Text style={styles.sourceMicro}>
              Source: {prettyHost(scraped.source)} · confidence: {scraped.confidence}
            </Text>
          </View>
        ) : scrapeError ? (
          <View style={styles.helperBox}>
            <Text style={styles.helperText}>{scrapeError}</Text>
            <Text style={[styles.helperText, { marginTop: 6 }]}>
              The calculated times above are still accurate for this mosque's location.
            </Text>
          </View>
        ) : (
          <View style={styles.helperBox}>
            <Text style={styles.helperText}>
              Tap "Read site" to fetch this mosque's published Iqamah times from {prettyHost(details.website)}. Many mosque sites publish their schedule in a format we can recognise; some don't, in which case the calculated times above remain your source.
            </Text>
          </View>
        )}
      </View>

      {!!details?.openingHours?.length && (
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Opening hours</Text>
          <View style={styles.hoursCard}>
            {details.openingHours.map((line) => (
              <Text key={line} style={styles.hoursLine}>{line}</Text>
            ))}
          </View>
        </View>
      )}

      <MethodPicker
        visible={showMethodPicker}
        method={method}
        school={school}
        onClose={() => setShowMethodPicker(false)}
        onChange={(m, s) => {
          setMethod(m);
          setSchool(s);
          setShowMethodPicker(false);
        }}
      />
    </ScrollView>
  );
}

// ---------------------------------------------------------------------------
// Method picker modal
// ---------------------------------------------------------------------------

function MethodPicker({ visible, method, school, onClose, onChange }) {
  const [m, setM] = useState(method);
  const [s, setS] = useState(school);

  useEffect(() => {
    setM(method);
    setS(school);
  }, [method, school, visible]);

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={pickerStyles.backdrop} onPress={onClose} />
      <View style={pickerStyles.sheet}>
        <View style={pickerStyles.handle} />
        <Text style={pickerStyles.title}>Calculation method</Text>
        <ScrollView style={pickerStyles.list}>
          {CALCULATION_METHODS.map((opt) => (
            <Pressable
              key={opt.id}
              onPress={() => setM(opt.id)}
              style={[pickerStyles.row, m === opt.id && pickerStyles.rowActive]}
            >
              <View style={{ flex: 1 }}>
                <Text style={[pickerStyles.rowName, m === opt.id && pickerStyles.rowNameActive]}>
                  {opt.name}
                </Text>
                <Text style={pickerStyles.rowMeta}>{opt.region}</Text>
              </View>
              {m === opt.id && <Text style={pickerStyles.check}>{'✓'}</Text>}
            </Pressable>
          ))}
        </ScrollView>

        <Text style={[pickerStyles.title, { marginTop: 12 }]}>Asr school</Text>
        {ASR_SCHOOLS.map((opt) => (
          <Pressable
            key={opt.id}
            onPress={() => setS(opt.id)}
            style={[pickerStyles.row, s === opt.id && pickerStyles.rowActive]}
          >
            <Text style={[pickerStyles.rowName, s === opt.id && pickerStyles.rowNameActive]}>
              {opt.name}
            </Text>
            {s === opt.id && <Text style={pickerStyles.check}>{'✓'}</Text>}
          </Pressable>
        ))}

        <View style={pickerStyles.footer}>
          <Pressable style={pickerStyles.cancel} onPress={onClose}>
            <Text style={pickerStyles.cancelText}>Cancel</Text>
          </Pressable>
          <Pressable style={pickerStyles.apply} onPress={() => onChange(m, s)}>
            <Text style={pickerStyles.applyText}>Apply</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const pickerStyles = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.45)' },
  sheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    maxHeight: '85%',
    backgroundColor: theme.colors.background,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 24,
  },
  handle: {
    width: 44,
    height: 4,
    borderRadius: 2,
    backgroundColor: theme.colors.divider,
    alignSelf: 'center',
    marginVertical: 8,
  },
  title: { ...theme.typography.title, color: theme.colors.text, marginVertical: 8 },
  list: { maxHeight: 320 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: theme.radii.md,
    marginVertical: 2,
  },
  rowActive: { backgroundColor: theme.colors.accentSoft },
  rowName: { ...theme.typography.subtitle, color: theme.colors.text },
  rowNameActive: { color: theme.colors.primaryDark },
  rowMeta: { ...theme.typography.caption, color: theme.colors.textMuted, marginTop: 2 },
  check: { fontSize: 18, color: theme.colors.primary, fontWeight: '700' },
  footer: { flexDirection: 'row', marginTop: 14 },
  cancel: { flex: 1, paddingVertical: 14, alignItems: 'center', borderRadius: theme.radii.md },
  cancelText: { ...theme.typography.subtitle, color: theme.colors.textMuted },
  apply: {
    flex: 1,
    paddingVertical: 14,
    alignItems: 'center',
    borderRadius: theme.radii.md,
    backgroundColor: theme.colors.primary,
  },
  applyText: { ...theme.typography.subtitle, color: '#fff' },
});

// ---------------------------------------------------------------------------
// Tiny helpers + styles
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
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: theme.radii.pill,
    backgroundColor: 'rgba(255,255,255,0.15)',
    marginRight: 8,
    marginTop: 6,
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
    flex: 1,
    alignItems: 'center',
    paddingVertical: 12,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radii.md,
    marginHorizontal: 4,
    ...theme.shadow.card,
  },
  label: { ...theme.typography.subtitle, color: theme.colors.primary },
});

function formatDistance(meters) {
  if (meters < 1000) return `${Math.round(meters)} m away`;
  return `${(meters / 1000).toFixed(meters < 10000 ? 1 : 0)} km away`;
}

function prettyHost(url) {
  try {
    return new URL(url).host.replace(/^www\./, '');
  } catch {
    return url;
  }
}

function nextPrayerKey(times) {
  if (!times) return null;
  const now = new Date();
  const minutesNow = now.getHours() * 60 + now.getMinutes();
  const order = ['Fajr', 'Dhuhr', 'Asr', 'Maghrib', 'Isha'];
  let best = null;
  let bestDelta = Infinity;
  for (const name of order) {
    const m = parseTimeToMinutes(times[name]);
    if (m == null) continue;
    const delta = m - minutesNow;
    if (delta >= 0 && delta < bestDelta) {
      best = name;
      bestDelta = delta;
    }
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
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 24,
  },
  heroEyebrow: {
    ...theme.typography.caption,
    color: theme.colors.accentSoft,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  heroTitle: { ...theme.typography.display, color: '#fff', marginTop: 4 },
  heroAddr: { ...theme.typography.body, color: theme.colors.accentSoft, marginTop: 6 },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 8 },

  actionRow: {
    flexDirection: 'row',
    marginHorizontal: 12,
    marginTop: -16,
  },

  section: { marginHorizontal: 16, marginTop: 22 },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  sectionLabel: {
    ...theme.typography.caption,
    color: theme.colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
  },
  refreshLink: { ...theme.typography.subtitle, color: theme.colors.primary },

  loadingBox: { paddingVertical: 30, alignItems: 'center' },
  loadingText: { ...theme.typography.body, color: theme.colors.textMuted, marginTop: 10 },

  emptyBox: {
    backgroundColor: theme.colors.surface,
    padding: 18,
    borderRadius: theme.radii.lg,
    ...theme.shadow.card,
  },
  emptyTitle: { ...theme.typography.title, color: theme.colors.text },
  emptyBody: { ...theme.typography.body, color: theme.colors.textMuted, marginTop: 6 },

  helperBox: {
    backgroundColor: theme.colors.surface,
    padding: 14,
    borderRadius: theme.radii.md,
    ...theme.shadow.card,
  },
  helperText: { ...theme.typography.body, color: theme.colors.textMuted },

  sourceMicro: {
    ...theme.typography.caption,
    color: theme.colors.textMuted,
    marginTop: 4,
  },

  metaInfoCard: {
    marginTop: 12,
    paddingVertical: 10,
    paddingHorizontal: 14,
    backgroundColor: theme.colors.surfaceAlt,
    borderRadius: theme.radii.md,
  },
  metaInfoLine: { ...theme.typography.body, color: theme.colors.text },
  metaInfoMuted: { ...theme.typography.caption, color: theme.colors.textMuted, marginTop: 2 },

  hoursCard: {
    backgroundColor: theme.colors.surface,
    padding: 14,
    borderRadius: theme.radii.md,
    ...theme.shadow.card,
  },
  hoursLine: { ...theme.typography.body, color: theme.colors.text, paddingVertical: 2 },
});

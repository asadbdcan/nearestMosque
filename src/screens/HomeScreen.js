import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  RefreshControl,
  Alert,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import HeaderHero from '../components/HeaderHero';
import MosqueCard from '../components/MosqueCard';
import RefreshButton from '../components/RefreshButton';
import { theme } from '../theme';
import { getCurrentCoords } from '../services/location';
import { findNearbyMosques, getActiveProvider } from '../services/places';

export default function HomeScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [coords, setCoords] = useState(null);
  const [mosques, setMosques] = useState([]);

  const load = useCallback(async ({ pullToRefresh = false } = {}) => {
    if (pullToRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const c = await getCurrentCoords();
      setCoords(c);
      const list = await findNearbyMosques(c, { radius: 5000 });
      setMosques(list);
      if (list.length === 0) {
        setError('No mosques found within 5 km. Try refreshing or check your network.');
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    } catch (e) {
      setError(e.message || 'Something went wrong.');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const onRefresh = () => load({ pullToRefresh: true });
  const onPressRefresh = () => {
    Haptics.selectionAsync().catch(() => {});
    load();
  };

  const nearest = mosques[0];
  const others = mosques.slice(1);

  return (
    <View style={[styles.container, { paddingBottom: insets.bottom }]}>
      <FlatList
        data={others}
        keyExtractor={(m) => m.id}
        contentContainerStyle={{ paddingBottom: 32 }}
        ListHeaderComponent={
          <View>
            <HeaderHero
              subtitle={
                coords
                  ? `Showing mosques near you (within 5 km) · source: ${
                      getActiveProvider() === 'google' ? 'Google Places' : 'OpenStreetMap'
                    }`
                  : 'Locating you to find nearby mosques…'
              }
            />

            <View style={styles.refreshWrap}>
              <RefreshButton onPress={onPressRefresh} loading={loading || refreshing} />
            </View>

            {error ? (
              <View style={styles.errorCard}>
                <Text style={styles.errorTitle}>We hit a snag</Text>
                <Text style={styles.errorBody}>{error}</Text>
              </View>
            ) : null}

            {nearest && (
              <View style={styles.section}>
                <Text style={styles.sectionLabel}>Nearest mosque</Text>
                <MosqueCard
                  mosque={nearest}
                  highlight
                  onPress={() => navigation.navigate('MosqueDetail', { mosque: nearest })}
                />
              </View>
            )}

            {others.length > 0 && (
              <Text style={[styles.sectionLabel, { marginTop: 18, marginHorizontal: 16 }]}>
                Other mosques nearby
              </Text>
            )}

            {loading && !nearest ? (
              <View style={styles.loadingWrap}>
                <ActivityIndicator color={theme.colors.primary} />
                <Text style={styles.loadingText}>Finding the closest mosques…</Text>
              </View>
            ) : null}
          </View>
        }
        renderItem={({ item }) => (
          <View style={{ marginHorizontal: 16 }}>
            <MosqueCard
              mosque={item}
              onPress={() => navigation.navigate('MosqueDetail', { mosque: item })}
            />
          </View>
        )}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={theme.colors.primary}
            colors={[theme.colors.primary]}
          />
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  refreshWrap: { marginTop: -18, marginBottom: 8, alignItems: 'center' },
  section: { marginHorizontal: 16, marginTop: 14 },
  sectionLabel: {
    ...theme.typography.caption,
    color: theme.colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    marginBottom: 6,
  },
  errorCard: {
    marginHorizontal: 16,
    marginTop: 12,
    padding: 14,
    backgroundColor: '#FFF1EE',
    borderRadius: theme.radii.md,
    borderWidth: 1,
    borderColor: '#F5C7BD',
  },
  errorTitle: { ...theme.typography.subtitle, color: theme.colors.danger },
  errorBody: { ...theme.typography.body, color: theme.colors.text, marginTop: 4 },
  loadingWrap: { paddingVertical: 28, alignItems: 'center' },
  loadingText: { ...theme.typography.body, color: theme.colors.textMuted, marginTop: 10 },
});

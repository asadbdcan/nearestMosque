import React, { useEffect, useRef } from 'react';
import { Pressable, Animated, Easing, StyleSheet, Text, View } from 'react-native';
import { theme } from '../theme';

export default function RefreshButton({ onPress, loading = false, label = 'Refresh' }) {
  const spin = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    let loop;
    if (loading) {
      spin.setValue(0);
      loop = Animated.loop(
        Animated.timing(spin, {
          toValue: 1,
          duration: 900,
          easing: Easing.linear,
          useNativeDriver: true,
        })
      );
      loop.start();
    } else {
      spin.stopAnimation();
    }
    return () => loop && loop.stop();
  }, [loading, spin]);

  const rotation = spin.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  return (
    <Pressable
      onPress={onPress}
      disabled={loading}
      style={({ pressed }) => [
        styles.btn,
        pressed && !loading && { opacity: 0.85 },
        loading && { opacity: 0.7 },
      ]}
    >
      <Animated.Text style={[styles.icon, { transform: [{ rotate: rotation }] }]}>
        {'↻'}
      </Animated.Text>
      <Text style={styles.label}>{loading ? 'Searching…' : label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.accent,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: theme.radii.pill,
    alignSelf: 'center',
    ...theme.shadow.card,
  },
  icon: { fontSize: 20, color: theme.colors.primaryDark, marginRight: 8, fontWeight: '900' },
  label: { ...theme.typography.subtitle, color: theme.colors.primaryDark, letterSpacing: 0.3 },
});

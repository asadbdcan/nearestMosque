// Modern Islamic minimal palette: deep emerald + warm gold accents.
export const theme = {
  colors: {
    primary: '#0B3D2E',       // deep emerald
    primaryDark: '#062318',
    primaryLight: '#14674A',
    accent: '#C9A24B',         // warm gold
    accentSoft: '#E9D8A6',
    background: '#F6F4EE',     // soft ivory
    surface: '#FFFFFF',
    surfaceAlt: '#F0EBE0',
    text: '#1B2A24',
    textMuted: '#5C6A63',
    divider: '#E2DDD0',
    danger: '#B23A48',
    success: '#2E8B57',
  },
  radii: {
    sm: 8,
    md: 14,
    lg: 22,
    pill: 999,
  },
  spacing: (n) => 4 * n,
  shadow: {
    card: {
      shadowColor: '#0B3D2E',
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.12,
      shadowRadius: 12,
      elevation: 4,
    },
  },
  typography: {
    display: { fontSize: 28, fontWeight: '700', letterSpacing: 0.2 },
    title: { fontSize: 20, fontWeight: '700' },
    subtitle: { fontSize: 16, fontWeight: '600' },
    body: { fontSize: 14, fontWeight: '500' },
    caption: { fontSize: 12, fontWeight: '500' },
    salahLarge: { fontSize: 22, fontWeight: '700', letterSpacing: 0.5 },
  },
};

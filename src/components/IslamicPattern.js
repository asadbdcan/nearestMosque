import React from 'react';
import Svg, { Defs, Pattern, Rect, Path, G } from 'react-native-svg';

/**
 * Subtle 8-point geometric Islamic pattern used as a header backdrop.
 * Renders as a tileable SVG so it scales cleanly on any device.
 */
export default function IslamicPattern({ width = '100%', height = 160, color = '#ffffff', opacity = 0.08 }) {
  return (
    <Svg width={width} height={height} viewBox="0 0 200 200" preserveAspectRatio="xMidYMid slice">
      <Defs>
        <Pattern id="star" x="0" y="0" width="60" height="60" patternUnits="userSpaceOnUse">
          <G stroke={color} strokeWidth="1.2" fill="none" opacity={opacity * 6}>
            <Path d="M30 5 L37 23 L55 25 L41 38 L46 56 L30 47 L14 56 L19 38 L5 25 L23 23 Z" />
            <Path d="M30 18 L34 28 L44 30 L36 37 L39 47 L30 41 L21 47 L24 37 L16 30 L26 28 Z" />
          </G>
        </Pattern>
      </Defs>
      <Rect width="200" height="200" fill="url(#star)" />
    </Svg>
  );
}

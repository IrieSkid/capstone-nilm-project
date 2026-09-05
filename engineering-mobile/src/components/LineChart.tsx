import { useState } from 'react';
import { LayoutChangeEvent, StyleSheet, Text, View } from 'react-native';
import Svg, { Line, Polyline, Text as SvgText } from 'react-native-svg';

import { theme } from '@/utils/theme';

export function LineChart({ title, values, unit, color = theme.colors.primary }: { title: string; values: (number | null)[]; unit: string; color?: string }) {
  const [width, setWidth] = useState(320);
  const cleanValues = values.filter((value): value is number => value !== null && Number.isFinite(value));
  const min = cleanValues.length ? Math.min(...cleanValues) : 0;
  const max = cleanValues.length ? Math.max(...cleanValues) : 0;
  const spread = Math.max(max - min, 0.01);
  const chartHeight = 150;
  const left = 44;
  const right = 10;
  const top = 12;
  const bottom = 24;
  const svgWidth = Math.max(width - 28, 240);
  const innerWidth = Math.max(svgWidth - left - right, 1);
  const innerHeight = chartHeight - top - bottom;
  const points = values
    .map((value, index) => {
      if (value === null || !Number.isFinite(value)) return null;
      const x = left + (index / Math.max(values.length - 1, 1)) * innerWidth;
      const y = top + ((max - value) / spread) * innerHeight;
      return `${x},${y}`;
    })
    .filter(Boolean)
    .join(' ');

  function measure(event: LayoutChangeEvent) {
    setWidth(event.nativeEvent.layout.width);
  }

  return (
    <View style={styles.card} onLayout={measure}>
      <View style={styles.header}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.readout}>{cleanValues.length ? `${cleanValues.at(-1)?.toFixed(2)} ${unit}` : 'No data'}</Text>
      </View>
      {cleanValues.length < 2 ? (
        <View style={styles.empty}><Text style={styles.emptyText}>At least two readings are needed to draw this graph.</Text></View>
      ) : (
        <Svg width={svgWidth} height={chartHeight}>
          {[0, 0.5, 1].map((ratio) => {
            const y = top + ratio * innerHeight;
            return <Line key={ratio} x1={left} y1={y} x2={left + innerWidth} y2={y} stroke={theme.colors.line} strokeWidth="1" />;
          })}
          <SvgText x="0" y={top + 5} fill={theme.colors.textMuted} fontSize="10">{max.toFixed(1)}</SvgText>
          <SvgText x="0" y={top + innerHeight} fill={theme.colors.textMuted} fontSize="10">{min.toFixed(1)}</SvgText>
          <Polyline points={points} fill="none" stroke={color} strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />
        </Svg>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { overflow: 'hidden', backgroundColor: theme.colors.surface, borderColor: theme.colors.line, borderWidth: 1, borderRadius: theme.radius.md, padding: 14 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  title: { color: theme.colors.text, fontWeight: '800', fontSize: 15 },
  readout: { color: theme.colors.primary, fontWeight: '800', fontSize: 13 },
  empty: { minHeight: 120, alignItems: 'center', justifyContent: 'center' },
  emptyText: { color: theme.colors.textMuted, textAlign: 'center' },
});

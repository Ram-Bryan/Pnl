import React, { useState, useMemo, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  ActivityIndicator,
  Pressable,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import Svg, {
  Polyline,
  Path,
  Defs,
  LinearGradient,
  Stop,
  Circle as SvgCircle,
  G,
  Line,
  Text as SvgText,
} from 'react-native-svg';
import { LinearGradient as ExpoLinearGradient } from 'expo-linear-gradient';
import { Card, EmptyState, Fab, PnlText, SectionHeader, Segmented, TradeRow } from '../../src/ui';
import { Sheet } from '../../src/ui/Sheet';
import { useDashboard } from '../../src/hooks/useDashboard';
import { formatMoney, formatPnl } from '../../src/lib/format';
import { computeTradePnl } from '../../src/stats/computeStats';
import { Ionicons } from '@expo/vector-icons';

type Period = 'today' | 'week' | 'month' | 'all';

// ─── Date helpers ────────────────────────────────────────────────────────────
function parseYMD(ymd: string) {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function formatYMD(d: Date) {
  return d.toISOString().slice(0, 10);
}

function stepMonth(ymd: string, direction: -1 | 1): string {
  const d = parseYMD(ymd);
  d.setUTCMonth(d.getUTCMonth() + direction);
  return formatYMD(d);
}

function stepWeek(ymd: string, direction: -1 | 1): string {
  const d = parseYMD(ymd);
  d.setUTCDate(d.getUTCDate() + (direction * 7));
  return formatYMD(d);
}

function getWeekDays(selectedYmd: string) {
  const d = parseYMD(selectedYmd);
  const day = d.getUTCDay();
  const diff = d.getUTCDate() - day + (day === 0 ? -6 : 1);
  const start = new Date(d.setUTCDate(diff));
  const days = [];
  for (let i = 0; i < 7; i++) {
    const cur = new Date(start);
    cur.setUTCDate(start.getUTCDate() + i);
    days.push(formatYMD(cur));
  }
  return days;
}

function getMonthDays(selectedYmd: string) {
  const d = parseYMD(selectedYmd);
  const year = d.getUTCFullYear();
  const month = d.getUTCMonth();
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const days = [];
  for (let i = 1; i <= daysInMonth; i++) {
    days.push(formatYMD(new Date(Date.UTC(year, month, i))));
  }
  return days;
}

function greetingForHour(hour: number): string {
  if (hour >= 5 && hour <= 11) return 'Good morning';
  if (hour >= 12 && hour <= 16) return 'Good afternoon';
  return 'Good evening';
}

// ─── Month/Year Picker (dual-column scroll) ───────────────────────────────────
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const ITEM_H = 44;

const MonthPicker = ({ visible, onClose, viewDate, onSelectMonth }: any) => {
  const currentYMD = parseYMD(viewDate);
  const [selMonth, setSelMonth] = React.useState(currentYMD.getUTCMonth());
  const [selYear, setSelYear] = React.useState(currentYMD.getUTCFullYear());

  // Build year range: 5 years back, 1 year forward
  const thisYear = new Date().getUTCFullYear();
  const years = Array.from({ length: 7 }, (_, i) => thisYear - 5 + i);

  const handleConfirm = () => {
    onSelectMonth(formatYMD(new Date(Date.UTC(selYear, selMonth, 1))));
    onClose();
  };

  return (
    <Sheet visible={visible} onClose={onClose} title="Select Month & Year">
      <View className="flex-row justify-center mt-4 gap-x-4">
        {/* Month column */}
        <View className="flex-1">
          <View style={{ height: ITEM_H * 5, overflow: 'hidden' }}>
            <ScrollView showsVerticalScrollIndicator={false} snapToInterval={ITEM_H} decelerationRate="fast">
              {MONTHS.map((m, i) => (
                <Pressable
                  key={m}
                  onPress={() => setSelMonth(i)}
                  style={{ height: ITEM_H, justifyContent: 'center', alignItems: 'center',
                    backgroundColor: selMonth === i ? '#1a3258' : 'transparent',
                    borderRadius: 12, marginBottom: 2 }}
                >
                  <Text style={{ color: selMonth === i ? '#ffffff' : '#6b6880',
                    fontWeight: selMonth === i ? '800' : '500', fontSize: 15 }}>{m}</Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        </View>

        {/* Divider */}
        <View className="w-px bg-dark-border my-2" />

        {/* Year column */}
        <View className="flex-1">
          <View style={{ height: ITEM_H * 5, overflow: 'hidden' }}>
            <ScrollView showsVerticalScrollIndicator={false} snapToInterval={ITEM_H} decelerationRate="fast">
              {years.map(y => (
                <Pressable
                  key={y}
                  onPress={() => setSelYear(y)}
                  style={{ height: ITEM_H, justifyContent: 'center', alignItems: 'center',
                    backgroundColor: selYear === y ? '#1a3258' : 'transparent',
                    borderRadius: 12, marginBottom: 2 }}
                >
                  <Text style={{ color: selYear === y ? '#ffffff' : '#6b6880',
                    fontWeight: selYear === y ? '800' : '500', fontSize: 15 }}>{y}</Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        </View>
      </View>

      <Pressable
        onPress={handleConfirm}
        className="mt-6 bg-[#2d7df6] rounded-2xl py-4 items-center"
      >
        <Text className="text-white font-black tracking-wide">Apply</Text>
      </Pressable>
    </Sheet>
  );
};

// ─── PnL Hero Card ────────────────────────────────────────────────────────────
const PnlHeroCard = ({ pnl, label }: { pnl: number; label: string }) => {
  const isZero = pnl === 0;
  const isPositive = pnl > 0;
  const gradientColors = isZero
    ? (['rgba(100,100,120,0.18)', 'rgba(100,100,120,0.05)', 'transparent'] as const)
    : isPositive
    ? (['rgba(0,230,138,0.25)', 'rgba(0,230,138,0.06)', 'transparent'] as const)
    : (['rgba(255,77,106,0.25)', 'rgba(255,77,106,0.06)', 'transparent'] as const);

  return (
    <View className="rounded-3xl overflow-hidden border border-dark-border mb-6">
      <ExpoLinearGradient
        colors={gradientColors}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{ padding: 24, backgroundColor: '#13141a' }}
      >
        <Text className="text-[10px] font-semibold text-white tracking-widest uppercase mb-3">
          {label}
        </Text>
        <PnlText value={pnl} size="text-5xl" weight="font-semibold" glow />
      </ExpoLinearGradient>
    </View>
  );
};

// ─── Weekly Calendar ─────────────────────────────────────────────────────────
const WeeklyCalendar = ({ currentWeek, selectedDate, onSelect, dailyPnls, onPrevWeek, onNextWeek }: any) => {
  const shortDays = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
  // Format week range label
  const start = parseYMD(currentWeek[0]);
  const end = parseYMD(currentWeek[6]);
  const weekLabel = `${start.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })} – ${end.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })}`;

  return (
    <View className="w-full mt-4 mb-1">
      {/* Week navigation header */}
      <View className="flex-row justify-between items-center mb-3">
        <Pressable onPress={onPrevWeek} className="w-8 h-8 items-center justify-center rounded-xl bg-[#1e1d2b]">
          <Ionicons name="chevron-back" size={14} color="#A8AEC1" />
        </Pressable>
        <Text className="text-xs font-bold text-white">{weekLabel}</Text>
        <Pressable onPress={onNextWeek} className="w-8 h-8 items-center justify-center rounded-xl bg-[#1e1d2b]">
          <Ionicons name="chevron-forward" size={14} color="#A8AEC1" />
        </Pressable>
      </View>
      <View className="flex-row justify-between w-full bg-[#13141a] rounded-2xl p-2 gap-x-1">
        {currentWeek.map((d: string, i: number) => {
          const pnl = dailyPnls[d] || 0;
          const isSelected = d === selectedDate;
          const hasActivity = pnl !== 0;
          const dotColor = pnl > 0 ? '#00E68A' : pnl < 0 ? '#FF4D6A' : '#3e3b4b';
          const pnlColor = pnl > 0 ? '#00E68A' : pnl < 0 ? '#FF4D6A' : '#6b6880';

          return (
            <Pressable
              key={d}
              onPress={() => onSelect(d)}
              className="flex-1 items-center justify-center rounded-xl py-3"
              style={{
                backgroundColor: isSelected ? '#23222e' : 'transparent',
                borderWidth: 1,
                borderColor: isSelected ? '#3e3b4b' : 'transparent',
              }}
            >
              <Text
                className="text-[11px] font-bold uppercase tracking-widest mb-2"
                style={{ color: isSelected ? '#ffffff' : '#6b6880' }}
              >
                {shortDays[i]}
              </Text>
              <View className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: dotColor }} />
              {hasActivity && (
                <Text className="text-[9px] font-bold mt-1" style={{ color: pnlColor }}>
                  ${(Math.abs(pnl))}
                </Text>
              )}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
};

// ─── Monthly Calendar ─────────────────────────────────────────────────────────
const MonthlyCalendar = ({ currentMonth, selectedDate, onSelect, dailyPnls, onTitlePress }: any) => {
  const firstDay = parseYMD(currentMonth[0]);
  const jsDay = firstDay.getUTCDay();
  const offset = jsDay === 0 ? 6 : jsDay - 1;
  const blanks = Array.from({ length: offset }).map((_, i) => i);
  const title = firstDay.toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' });
  const totalMonthPnl = currentMonth.reduce((sum: number, d: string) => sum + (dailyPnls[d] || 0), 0);

  return (
    <View className="w-full mt-4">
      <View className="flex-row justify-end items-center mb-5">
        <Pressable onPress={onTitlePress} className="bg-[#13141a] px-4 py-2 rounded-xl flex-row items-center border border-[#2b2d35]">
          <Text className="text-white font-bold text-xs mr-2">{title}</Text>
          <Ionicons name="chevron-down" size={12} color="#A8AEC1" />
        </Pressable>
      </View>
      <View className="w-full">
        <View className="flex-row mb-3">
          {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((day, i) => (
            <View key={`h-${i}`} className="flex-1 items-center">
              <Text className="text-[10px] text-dark-text-muted font-bold tracking-wide">{day}</Text>
            </View>
          ))}
        </View>
        <View className="flex-row flex-wrap gap-y-1.5">
          {blanks.map(b => (
            <View key={`b-${b}`} style={{ width: '14.28%' }} className="aspect-square p-[2px]" />
          ))}
          {currentMonth.map((d: string) => {
            const pnl = dailyPnls[d] || 0;
            const isSelected = d === selectedDate;
            const [,, dayNum] = d.split('-');
            let dotColor = '#2f2c3b';
            if (pnl > 0) dotColor = '#00E68A';
            if (pnl < 0) dotColor = '#FF4D6A';
            return (
              <View key={d} style={{ width: '14.28%' }} className="aspect-square p-[2px]">
                <Pressable
                  onPress={() => onSelect(d)}
                  className="w-full h-full items-center justify-center rounded-xl border"
                  style={{
                    backgroundColor: isSelected ? '#1a3258' : pnl < 0 ? 'rgba(255,77,106,0.08)' : 'transparent',
                    borderColor: isSelected ? '#2d7df6' : 'transparent',
                  }}
                >
                  <Text className={`text-xs ${isSelected ? 'text-white' : 'text-dark-text-secondary'} font-semibold`}>
                    {parseInt(dayNum, 10)}
                  </Text>
                  {pnl !== 0 && (
                    <View className="w-1 h-1 rounded-full mt-0.5" style={{ backgroundColor: dotColor }} />
                  )}
                </Pressable>
              </View>
            );
          })}
        </View>
      </View>
    </View>
  );
};

// ─── Trendline with Y and X axes ─────────────────────────────────────────────

const getNiceTicks = (min: number, max: number, tickCount = 5) => {
  if (min === max) return [min - 10, min, min + 10];
  const range = max - min;
  const roughStep = range / (tickCount - 1);
  const magnitude = Math.pow(10, Math.floor(Math.log10(roughStep)));
  const normalized = roughStep / Math.max(magnitude, 0.0001);
  let step = magnitude;
  if (normalized > 5) step = 10 * magnitude;
  else if (normalized > 2) step = 5 * magnitude;
  else if (normalized > 1) step = 2 * magnitude;
  const tickMin = Math.floor(min / step) * step;
  const tickMax = Math.ceil(max / step) * step;
  const ticks = [];
  for (let i = tickMin; i <= tickMax; i += step) ticks.push(i);
  return ticks;
};

type TrendlineProps = {
  points: { value: number; tooltip: string; pct: number }[];
  xTicks: { label: string; pct: number }[];
};

function formatPnlShort(v: number): string {
  if (Math.abs(v) >= 1000) return `${(v / 1000).toFixed(1)}k`;
  return `${Math.round(v)}`;
}

const Trendline = ({ points, xTicks }: TrendlineProps) => {
  const [dim, setDim] = useState({ w: 0, h: 0 });
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  const n = points.length;

  if (!points || n < 2) {
    return (
      <View className="h-56 justify-center items-center mt-4 w-full">
        <Text className="text-dark-text-muted text-[10px] font-medium tracking-widest uppercase">No activity</Text>
      </View>
    );
  }

  const PAD_LEFT = 45;
  const PAD_RIGHT = 16;
  const PAD_TOP = 16;
  const PAD_BOTTOM = 22;

  const PLOT_W = Math.max(0, dim.w - PAD_LEFT - PAD_RIGHT);
  const PLOT_H = Math.max(0, dim.h - PAD_TOP - PAD_BOTTOM);

  const dataValues = points.map(p => p.value);
  const rawMin = Math.min(...dataValues, 0);
  const rawMax = Math.max(...dataValues, 0);
  
  const yTicks = getNiceTicks(rawMin, rawMax, 4);
  const minVal = yTicks[0];
  const maxVal = yTicks[yTicks.length - 1];
  const range = maxVal - minVal;

  const yForValue = (val: number) => {
    if (range === 0) return PAD_TOP + PLOT_H / 2;
    return PAD_TOP + (1 - (val - minVal) / range) * PLOT_H;
  };

  const xForPct = (pct: number) => {
    return PAD_LEFT + pct * PLOT_W;
  };

  const coords = points.map((p) => ({
    x: xForPct(p.pct),
    y: yForValue(p.value)
  }));

  const zeroY = yForValue(0);
  const isZeroVisible = minVal < 0 && maxVal > 0;

  const finalPnl = points[n - 1].value;
  const primaryColor = finalPnl > 0 ? '#00E68A' : finalPnl < 0 ? '#FF4D6A' : '#6b6880';
  
  const polylinePoints = coords.map(c => `${c.x},${c.y}`).join(' ');

  const baseY = PAD_TOP + PLOT_H;

  const pathData =
    `M ${coords[0].x},${baseY} ` +
    coords.map(c => `L ${c.x},${c.y}`).join(' ') +
    ` L ${coords[n - 1].x},${baseY} Z`;

  return (
    <View 
      className="mt-4 w-full h-56 relative" 
      onLayout={e => setDim({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}
    >
      {dim.w > 0 && dim.h > 0 && (
        <Svg width={dim.w} height={dim.h}>
          <Defs>
            <LinearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={primaryColor} stopOpacity="0.4" />
              <Stop offset="0.9" stopColor={primaryColor} stopOpacity="0.0" />
            </LinearGradient>
          </Defs>

          {/* Background Ticks */}
          {yTicks.map((val, i) => {
            const y = yForValue(val);
            return (
              <Line
                key={`grid-${i}`}
                x1={PAD_LEFT} y1={y} x2={dim.w - PAD_RIGHT} y2={y}
                stroke="#1e1e2d" strokeWidth="1" strokeDasharray="3,3"
              />
            );
          })}
          
          {/* Zero grid line accent */}
          {isZeroVisible && (
            <Line
              x1={PAD_LEFT} y1={zeroY} x2={dim.w - PAD_RIGHT} y2={zeroY}
              stroke="#2d2d42" strokeWidth="1.5"
            />
          )}

          {/* Area */}
          <Path d={pathData} fill="url(#areaGrad)" />

          {/* Line */}
          <Polyline
            points={polylinePoints}
            fill="none"
            stroke={primaryColor}
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* Hover highlight */}
          {hoverIndex !== null && (
            <>
              <Line
                x1={coords[hoverIndex].x} y1={PAD_TOP}
                x2={coords[hoverIndex].x} y2={baseY}
                stroke="#6b6880" strokeWidth="1" strokeDasharray="4,4"
              />
              <SvgCircle
                cx={coords[hoverIndex].x}
                cy={coords[hoverIndex].y}
                r="5"
                fill="#13141a"
                stroke={primaryColor}
                strokeWidth="2.5"
              />
            </>
          )}

          {/* Y Axis Labels */}
          {yTicks.map((val, i) => (
            <SvgText
              key={`y-${i}`}
              x={PAD_LEFT - 8}
              y={yForValue(val) + 4}
              fontSize="11"
              fontFamily="Roboto, system-ui"
              fontWeight="600"
              fill="#6b6880"
              textAnchor="end"
            >
              {formatPnlShort(val)}
            </SvgText>
          ))}

          {/* X Axis Labels (bottom ticks) */}
          {xTicks.map((tick, i) => {
            let anchor: "start" | "middle" | "end" = "middle";
            if (tick.pct === 0) anchor = "start";
            if (tick.pct === 1) anchor = "end";
            
            return (
              <SvgText
                key={`x-${i}`}
                x={xForPct(tick.pct)}
                y={dim.h - 5}
                fontSize="10"
                fontFamily="Roboto, system-ui"
                fontWeight="700"
                fill="#545263"
                textAnchor={anchor}
              >
                {tick.label}
              </SvgText>
            );
          })}
        </Svg>
      )}

      {/* Invisible flex columns for touch */}
      <View className="absolute inset-0 flex-row z-10" style={{ left: PAD_LEFT, right: PAD_RIGHT, bottom: PAD_BOTTOM, top: PAD_TOP }}>
        {points.map((_, i) => (
          <Pressable
            key={i}
            className="flex-1 h-full"
            onPressIn={() => setHoverIndex(i)}
            onPressOut={() => setHoverIndex(null)}
          />
        ))}
      </View>

      {/* Tooltip Hover Bubble */}
      {hoverIndex !== null && dim.w > 0 && (
        <View
          style={{
            position: 'absolute',
            top: 0,
            left: Math.max(PAD_LEFT, Math.min(dim.w - PAD_RIGHT - 80, coords[hoverIndex].x - 40)),
            backgroundColor: '#1c1d27',
            paddingVertical: 5,
            paddingHorizontal: 10,
            borderRadius: 8,
            borderWidth: 1,
            borderColor: '#2b2d39',
            alignItems: 'center',
            zIndex: 20
          }}
          pointerEvents="none"
        >
          <Text className="text-[10px] uppercase font-bold text-dark-text-muted mb-0.5">
            {points[hoverIndex].tooltip}
          </Text>
          <Text className={`text-xs font-black ${points[hoverIndex].value >= 0 ? 'text-[#00E68A]' : 'text-[#FF4D6A]'}`}>
            {points[hoverIndex].value > 0 ? '+' : ''}{points[hoverIndex].value.toFixed(2)}
          </Text>
        </View>
      )}
    </View>
  );
};

// ─── Big Donut for Win Rate ────────────────────────────────────────────────
// Arc ends use strokeLinecap="butt" (square) per design spec.
const BigDonut = ({ winRate, wins, losses }: { winRate: number; wins: number; losses: number }) => {
  const CX = 50, CY = 50, R = 40;
  const strokeW = 12;
  const circumference = 2 * Math.PI * R;
  const winLength = (winRate / 100) * circumference;
  const lossLength = circumference - winLength;

  return (
    <View className="items-center justify-center w-full">
      <View style={{ width: 220, height: 220, alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
        <Svg width={220} height={220} viewBox="0 0 100 100">
          <G rotation="-90" origin="50, 50">
            {/* Track */}
            <SvgCircle cx={CX} cy={CY} r={R} stroke="#1e1e28" strokeWidth={strokeW} fill="transparent" />
            {/* Loss arc */}
            <SvgCircle
              cx={CX} cy={CY} r={R}
              stroke="#FF4D6A"
              strokeWidth={strokeW}
              fill="transparent"
              strokeDasharray={`${lossLength} ${circumference}`}
              strokeDashoffset={-winLength}
              strokeLinecap="butt"
            />
            {/* Win arc */}
            <SvgCircle
              cx={CX} cy={CY} r={R}
              stroke="#00E68A"
              strokeWidth={strokeW}
              fill="transparent"
              strokeDasharray={`${winLength} ${circumference}`}
              strokeLinecap="butt"
            />
          </G>
        </Svg>

        {/* Centre label */}
        <View className="absolute items-center justify-center" pointerEvents="none">
          <Text className="text-[9px] uppercase tracking-widest font-bold mb-1" style={{ color: '#6b6880' }}>Win Rate</Text>
          <Text className="text-3xl font-black text-white">{winRate.toFixed(0)}%</Text>
        </View>
      </View>

      {/* Static Legend Block */}
      <View className="flex-row items-center justify-center mt-2 gap-x-8">
        <View className="flex-row items-center gap-x-2">
          <View className="w-3 h-3 rounded-full bg-[#00E68A]" />
          <Text className="text-xs font-bold text-white tracking-wide">{wins} Wins</Text>
        </View>
        <View className="flex-row items-center gap-x-2">
          <View className="w-3 h-3 rounded-full bg-[#FF4D6A]" />
          <Text className="text-xs font-bold text-white tracking-wide">{losses} Losses</Text>
        </View>
      </View>
    </View>
  );
};

// ─── Dashboard Screen ────────────────────────────────────────────────────────
export default function Dashboard() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { stats, trades, weeklyGoal, loading, error } = useDashboard();

  const [period, setPeriod] = useState<Period>('today');
  const todayLocal = useMemo(() => {
    const offset = new Date().getTimezoneOffset() * 60000;
    return new Date(Date.now() - offset).toISOString().split('T')[0];
  }, []);

  const [selectedDate, setSelectedDate] = useState<string>(todayLocal);
  const [viewDate, setViewDate] = useState<string>(todayLocal);
  const [pickerVisible, setPickerVisible] = useState(false);

  useEffect(() => {
    if (period === 'today') {
      setSelectedDate(todayLocal);
      setViewDate(todayLocal);
    }
  }, [period, todayLocal]);

  useEffect(() => {
    setViewDate(selectedDate);
  }, [selectedDate]);

  const dailyPnls = useMemo(() => {
    const map: Record<string, number> = {};
    trades.forEach(t => {
      const d = (t.exit_at ?? t.entry_at).slice(0, 10);
      const pnl = computeTradePnl(t);
      map[d] = (map[d] || 0) + pnl;
    });
    return map;
  }, [trades]);

  const currentWeek = useMemo(() => getWeekDays(viewDate), [viewDate]);
  const currentMonth = useMemo(() => getMonthDays(viewDate), [viewDate]);

  const { chartPoints, xTicks } = useMemo(() => {
    let dataset: { pnl: number, timeStr: string }[] = [];

    if (period === 'today') {
      const todayTrades = [...trades]
        .filter(t => (t.exit_at ?? t.entry_at).slice(0, 10) === selectedDate)
        .reverse();
      dataset = todayTrades.map(t => ({ pnl: computeTradePnl(t), timeStr: t.exit_at ?? t.entry_at }));
    } else if (period === 'week') {
      dataset = currentWeek.map(d => ({ pnl: dailyPnls[d] || 0, timeStr: d }));
    } else if (period === 'month') {
      dataset = currentMonth.map(d => ({ pnl: dailyPnls[d] || 0, timeStr: d }));
    } else {
      const dayMap: Record<string, number> = {};
      const allDays: string[] = [];
      [...trades].reverse().forEach(t => {
         const day = (t.exit_at ?? t.entry_at).slice(0, 10);
         if (!dayMap[day]) {
            dayMap[day] = 0;
            allDays.push(day);
         }
         dayMap[day] += computeTradePnl(t);
      });
      dataset = allDays.map(d => ({ pnl: dayMap[d], timeStr: d }));
    }

    const n = dataset.length;
    let points: { value: number; tooltip: string; pct: number }[] = [];
    const ticks: { label: string, pct: number }[] = [];

    if (period === 'today') {
      let cumulative = 0;
      points.push({ value: 0, tooltip: '00:00', pct: 0 });
      dataset.forEach(d => {
        cumulative += d.pnl;
        const hr = parseInt(d.timeStr.slice(11, 13), 10) || 0;
        const min = parseInt(d.timeStr.slice(14, 16), 10) || 0;
        const pct = (hr + min / 60) / 24;
        const tooltipStr = d.timeStr.length > 11 ? d.timeStr.slice(11, 16) : 'Now';
        points.push({ value: cumulative, tooltip: tooltipStr, pct });
      });
      if (points[points.length - 1].pct < 1) {
        points.push({ value: cumulative, tooltip: '24:00', pct: 1 });
      }
      
       ticks.push(
        { label: '00:00', pct: 0 },
        { label: '06:00', pct: 0.25 },
        { label: '12:00', pct: 0.5 },
        { label: '18:00', pct: 0.75 },
        { label: '24:00', pct: 1 }
      );
    } else if (period === 'week') {
      let cumulative = 0;
      points.push({ value: 0, tooltip: currentWeek[0] || 'Mon', pct: 0 });
      dataset.forEach((d, i) => {
        cumulative += d.pnl;
        points.push({ value: cumulative, tooltip: d.timeStr, pct: (i + 1) / 7 });
      });
      const days = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
      days.forEach((d, i) => ticks.push({ label: d, pct: (i + 1) / 7 }));
    } else if (period === 'month') {
      let cumulative = 0;
      points.push({ value: 0, tooltip: currentMonth[0] || '1st', pct: 0 });
      dataset.forEach((d, i) => {
        cumulative += d.pnl;
        points.push({ value: cumulative, tooltip: d.timeStr, pct: (i + 1) / Math.max(1, dataset.length) });
      });
      // No x-axis items on month (YouTube style)
    } else {
      let cumulative = 0;
      points.push({ value: 0, tooltip: dataset[0]?.timeStr || 'First', pct: 0 });
      dataset.forEach((d, i) => {
        cumulative += d.pnl;
        points.push({ value: cumulative, tooltip: d.timeStr, pct: (i + 1) / Math.max(1, dataset.length) });
      });
      // No x-axis items on all time 
    }

    // Fix overlap if trades happen at exactly same time (ensure monotonic strict increase)
    for (let i = 1; i < points.length; i++) {
        if (points[i].pct <= points[i - 1].pct) {
            points[i].pct = points[i - 1].pct + 0.001;
        }
    }
    // Re-normalize to [0,1] if we pushed anything over 1
    const maxPct = points[points.length - 1]?.pct;
    if (maxPct > 1) {
        points.forEach(p => p.pct = p.pct / maxPct);
    }

    return { chartPoints: points, xTicks: ticks };
  }, [period, trades, selectedDate, currentWeek, currentMonth, dailyPnls]);

  // Trades visible in the bottom list: ALL trades for the current period
  const visibleTrades = useMemo(() => {
    if (period === 'today') {
      return trades.filter(t => (t.exit_at ?? t.entry_at).slice(0, 10) === selectedDate);
    }
    if (period === 'week') {
      const weekSet = new Set(currentWeek);
      return trades.filter(t => weekSet.has((t.exit_at ?? t.entry_at).slice(0, 10)));
    }
    if (period === 'month') {
      const monthSet = new Set(currentMonth);
      return trades.filter(t => monthSet.has((t.exit_at ?? t.entry_at).slice(0, 10)));
    }
    return trades;
  }, [trades, period, selectedDate, currentWeek, currentMonth]);

  // PnL hero: dynamically computed from the currently visible trades
  const selectedPnl = useMemo(() => {
    return visibleTrades.reduce((sum, t) => sum + computeTradePnl(t), 0);
  }, [visibleTrades]);

  const periodLabel = useMemo(() => {
    if (period === 'today') return "Today's P&L";
    if (period === 'week') return "This Week's P&L";
    if (period === 'month') return "This Month's P&L";
    return "All Time P&L";
  }, [period]);

  const periodStartDate = period === 'week' ? currentWeek[0] : currentMonth[0];

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center bg-dark-bg">
        <ActivityIndicator size="large" color="#00E68A" />
      </View>
    );
  }

  if (error) {
    return (
      <View className="flex-1 items-center justify-center bg-dark-bg">
        <EmptyState icon="alert-circle-outline" title="Couldn't load dashboard." subtitle={error.message} />
      </View>
    );
  }

  return (
    <View className="flex-1 bg-dark-bg" style={{ paddingTop: insets.top }}>
      <MonthPicker
        visible={pickerVisible}
        onClose={() => setPickerVisible(false)}
        viewDate={viewDate}
        onSelectMonth={(newDate: string) => {
          setViewDate(newDate);
          setSelectedDate(newDate);
        }}
      />

      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 120 }}>

        {/* Header */}
        <Animated.View entering={FadeIn.duration(600)} className="flex-row justify-between items-center mb-6">
          <View>
            <Text className="text-[11px] text-dark-text-muted font-medium tracking-widest uppercase mb-0.5">
              {greetingForHour(new Date().getHours())}
            </Text>
            <Text className="text-2xl font-black text-dark-text tracking-tight">Dashboard</Text>
          </View>
        </Animated.View>

        {/* ─── PnL Hero Card ─── */}
        <Animated.View entering={FadeInDown.duration(500).delay(50)}>
          <PnlHeroCard pnl={selectedPnl} label={periodLabel} />
        </Animated.View>

        {/* ─── Chart Card ─── */}
        <Animated.View entering={FadeInDown.duration(500).delay(150)}>
          <Card className="p-5 mb-6 w-full">
            <Segmented
              options={[
                { key: 'today', label: 'Today' },
                { key: 'week', label: 'Week' },
                { key: 'month', label: 'Month' },
                { key: 'all', label: 'All Time' },
              ]}
              value={period}
              onChange={setPeriod}
            />

            {period === 'week' && (
              <WeeklyCalendar
                currentWeek={currentWeek}
                selectedDate={selectedDate}
                dailyPnls={dailyPnls}
                onSelect={setSelectedDate}
                onPrevWeek={() => setViewDate(prev => stepWeek(prev, -1))}
                onNextWeek={() => setViewDate(prev => stepWeek(prev, 1))}
              />
            )}

            {period === 'month' && (
              <MonthlyCalendar
                currentMonth={currentMonth}
                selectedDate={selectedDate}
                dailyPnls={dailyPnls}
                onSelect={setSelectedDate}
                onTitlePress={() => setPickerVisible(true)}
              />
            )}

            <Trendline
              points={chartPoints}
              xTicks={xTicks}
            />
          </Card>
        </Animated.View>

        {/* ─── Big Donut / Win Rate ─── */}
        <Animated.View entering={FadeInDown.duration(500).delay(250)}>
          <Card className="p-6 mb-6 items-center bg-[#10111a]">
            <BigDonut winRate={stats.winRate} wins={stats.wins} losses={stats.losses} />
          </Card>
        </Animated.View>

        {/* ─── Trades Section ─── */}
        <Animated.View entering={FadeInDown.duration(500).delay(350)}>
          <SectionHeader
            title="Trades"
            actionLabel={visibleTrades.length > 5 ? 'See All' : undefined}
            onAction={() => router.push('/(tabs)/trades')}
          />
          {visibleTrades.length === 0 ? (
            <EmptyState icon="calendar-outline" title="No trades" subtitle="Tap + to log a trade for this day." />
          ) : (
            <View className="mt-2">
              {visibleTrades.map((trade, i) => (
                <TradeRow
                  key={trade.id}
                  trade={trade}
                  index={i}
                  onPress={() => router.push(`/trade/${trade.id}`)}
                />
              ))}
            </View>
          )}
        </Animated.View>

      </ScrollView>

      <View className="absolute bottom-6 right-6">
        <Fab onPress={() => router.push('/add-trade')} />
      </View>
    </View>
  );
}

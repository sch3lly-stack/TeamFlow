import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { format } from "date-fns";
import { useTheme } from "../providers/ThemeProvider";
import { CHART_COLORS, humanize } from "../lib/utils";

const PRIORITY_COLORS: Record<string, string> = {
  LOW: "#94a3b8",
  MEDIUM: "#0ea5e9",
  HIGH: "#f97316",
  URGENT: "#ef4444",
};

function useChartTheme() {
  const { theme } = useTheme();
  const dark = theme === "dark";
  return {
    grid: dark ? "#1e293b" : "#e2e8f0",
    axis: dark ? "#64748b" : "#94a3b8",
    tooltip: {
      backgroundColor: dark ? "#111829" : "#ffffff",
      border: `1px solid ${dark ? "#334155" : "#e2e8f0"}`,
      borderRadius: "10px",
      fontSize: "12px",
      color: dark ? "#e2e8f0" : "#0f172a",
      boxShadow: "0 16px 40px -16px rgba(15,23,42,0.4)",
    } as const,
    labelStyle: { color: dark ? "#94a3b8" : "#64748b", marginBottom: 4 },
  };
}

const dateTick = (value: string) => {
  try {
    return format(new Date(value), "MMM d");
  } catch {
    return value;
  }
};

export function CompletionTrendChart({
  data,
  height = 190,
}: {
  data: { date: string; completed: number }[];
  height?: number;
}) {
  const colors = useChartTheme();
  if (data.length === 0) {
    return <div className="flex h-[190px] items-center justify-center text-xs text-slate-400">No completions yet</div>;
  }
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 8, right: 8, left: -28, bottom: 0 }}>
        <defs>
          <linearGradient id="completionFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#6366f1" stopOpacity={0.35} />
            <stop offset="100%" stopColor="#6366f1" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke={colors.grid} strokeDasharray="3 3" vertical={false} />
        <XAxis
          dataKey="date"
          tickFormatter={dateTick}
          axisLine={false}
          tickLine={false}
          tick={{ fill: colors.axis, fontSize: 10 }}
          minTickGap={24}
        />
        <YAxis
          allowDecimals={false}
          axisLine={false}
          tickLine={false}
          tick={{ fill: colors.axis, fontSize: 10 }}
          width={38}
        />
        <Tooltip
          contentStyle={colors.tooltip}
          labelStyle={colors.labelStyle}
          labelFormatter={(value) => format(new Date(String(value)), "MMM d, yyyy")}
          formatter={(value: number) => [value, "Completed tasks"]}
        />
        <Area
          type="monotone"
          dataKey="completed"
          stroke="#6366f1"
          strokeWidth={2}
          fill="url(#completionFill)"
          dot={false}
          activeDot={{ r: 4, strokeWidth: 2, stroke: "#fff" }}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function ThroughputChart({
  data,
  height = 210,
}: {
  data: { week: string; completed: number; created: number }[];
  height?: number;
}) {
  const colors = useChartTheme();
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: -24, bottom: 0 }} barGap={4}>
        <CartesianGrid stroke={colors.grid} strokeDasharray="3 3" vertical={false} />
        <XAxis
          dataKey="week"
          tickFormatter={dateTick}
          axisLine={false}
          tickLine={false}
          tick={{ fill: colors.axis, fontSize: 10 }}
        />
        <YAxis allowDecimals={false} axisLine={false} tickLine={false} tick={{ fill: colors.axis, fontSize: 10 }} width={34} />
        <Tooltip contentStyle={colors.tooltip} labelStyle={colors.labelStyle} labelFormatter={(value) => `Week of ${format(new Date(String(value)), "MMM d")}`} />
        <Legend wrapperStyle={{ fontSize: 11, color: colors.axis }} iconType="circle" iconSize={7} />
        <Bar dataKey="created" name="Created" fill="#c7d2fe" radius={[4, 4, 0, 0]} maxBarSize={22} />
        <Bar dataKey="completed" name="Completed" fill="#6366f1" radius={[4, 4, 0, 0]} maxBarSize={22} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function PriorityDonut({
  data,
  height = 200,
}: {
  data: { priority: string; count: number }[];
  height?: number;
}) {
  const colors = useChartTheme();
  const total = data.reduce((sum, entry) => sum + entry.count, 0);
  if (total === 0) {
    return <div className="flex h-[200px] items-center justify-center text-xs text-slate-400">No open tasks</div>;
  }
  return (
    <ResponsiveContainer width="100%" height={height}>
      <PieChart>
        <Pie
          data={data.filter((entry) => entry.count > 0)}
          dataKey="count"
          nameKey="priority"
          innerRadius={48}
          outerRadius={72}
          paddingAngle={3}
          strokeWidth={0}
        >
          {data
            .filter((entry) => entry.count > 0)
            .map((entry) => (
              <Cell key={entry.priority} fill={PRIORITY_COLORS[entry.priority] ?? "#64748b"} />
            ))}
        </Pie>
        <Tooltip
          contentStyle={colors.tooltip}
          labelStyle={colors.labelStyle}
          formatter={(value: number, name) => [`${value} tasks`, humanize(String(name))]}
        />
        <Legend
          wrapperStyle={{ fontSize: 11 }}
          iconType="circle"
          iconSize={7}
          formatter={(value) => <span style={{ color: colors.axis }}>{humanize(String(value))}</span>}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}

export function BurndownChart({
  data,
  height = 240,
}: {
  data: { date: string; remainingTasks: number; idealTasks: number }[];
  height?: number;
}) {
  const colors = useChartTheme();
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 8, right: 12, left: -24, bottom: 0 }}>
        <CartesianGrid stroke={colors.grid} strokeDasharray="3 3" vertical={false} />
        <XAxis
          dataKey="date"
          tickFormatter={dateTick}
          axisLine={false}
          tickLine={false}
          tick={{ fill: colors.axis, fontSize: 10 }}
          minTickGap={20}
        />
        <YAxis allowDecimals={false} axisLine={false} tickLine={false} tick={{ fill: colors.axis, fontSize: 10 }} width={34} />
        <Tooltip
          contentStyle={colors.tooltip}
          labelStyle={colors.labelStyle}
          labelFormatter={(value) => format(new Date(String(value)), "MMM d, yyyy")}
        />
        <Legend wrapperStyle={{ fontSize: 11 }} iconType="plainline" />
        <Line type="monotone" dataKey="remainingTasks" name="Remaining" stroke="#6366f1" strokeWidth={2} dot={false} />
        <Line
          type="monotone"
          dataKey="idealTasks"
          name="Ideal"
          stroke="#94a3b8"
          strokeDasharray="5 5"
          strokeWidth={1.5}
          dot={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

export function VelocityChart({
  data,
  height = 210,
}: {
  data: { name: string; completedTasks: number; completedPoints: number }[];
  height?: number;
}) {
  const colors = useChartTheme();
  if (data.length === 0) {
    return (
      <div className="flex h-[210px] items-center justify-center text-xs text-slate-400">
        Velocity appears after a sprint is completed
      </div>
    );
  }
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: -24, bottom: 0 }}>
        <CartesianGrid stroke={colors.grid} strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: colors.axis, fontSize: 10 }} />
        <YAxis allowDecimals={false} axisLine={false} tickLine={false} tick={{ fill: colors.axis, fontSize: 10 }} width={34} />
        <Tooltip contentStyle={colors.tooltip} labelStyle={colors.labelStyle} />
        <Bar dataKey="completedPoints" name="Completed points" fill="#8b5cf6" radius={[4, 4, 0, 0]} maxBarSize={32} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function AssigneeChart({
  data,
  height = 220,
}: {
  data: { name: string; open: number; done: number; avatarColor: string }[];
  height?: number;
}) {
  const colors = useChartTheme();
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data.slice(0, 8)} layout="vertical" margin={{ top: 0, right: 12, left: 8, bottom: 0 }}>
        <CartesianGrid stroke={colors.grid} strokeDasharray="3 3" horizontal={false} />
        <XAxis type="number" allowDecimals={false} axisLine={false} tickLine={false} tick={{ fill: colors.axis, fontSize: 10 }} />
        <YAxis
          type="category"
          dataKey="name"
          axisLine={false}
          tickLine={false}
          tick={{ fill: colors.axis, fontSize: 10 }}
          width={92}
        />
        <Tooltip contentStyle={colors.tooltip} labelStyle={colors.labelStyle} />
        <Legend wrapperStyle={{ fontSize: 11 }} iconType="circle" iconSize={7} />
        <Bar dataKey="open" name="Open" fill="#f59e0b" radius={[0, 3, 3, 0]} maxBarSize={16} />
        <Bar dataKey="done" name="Done" fill="#22c55e" radius={[0, 3, 3, 0]} maxBarSize={16} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function SimpleProjectStatusChart({
  data,
}: {
  data: { status: string; count: number }[];
}) {
  const colors = useChartTheme();
  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: -24, bottom: 0 }}>
        <CartesianGrid stroke={colors.grid} strokeDasharray="3 3" vertical={false} />
        <XAxis
          dataKey="status"
          tickFormatter={(value) => humanize(String(value))}
          axisLine={false}
          tickLine={false}
          tick={{ fill: colors.axis, fontSize: 10 }}
        />
        <YAxis allowDecimals={false} axisLine={false} tickLine={false} tick={{ fill: colors.axis, fontSize: 10 }} width={34} />
        <Tooltip contentStyle={colors.tooltip} labelStyle={colors.labelStyle} formatter={(value: number) => [value, "Projects"]} />
        <Bar dataKey="count" radius={[4, 4, 0, 0]} maxBarSize={38}>
          {data.map((entry, index) => (
            <Cell key={entry.status} fill={CHART_COLORS[index % CHART_COLORS.length]} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

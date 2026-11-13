export type OrgRole =
  | "OWNER"
  | "ADMIN"
  | "PROJECT_MANAGER"
  | "TEAM_LEAD"
  | "DEVELOPER"
  | "VIEWER";

export type ProjectRole = "MANAGER" | "CONTRIBUTOR" | "VIEWER";
export type Priority = "LOW" | "MEDIUM" | "HIGH" | "URGENT";
export type ProjectStatus = "PLANNING" | "ACTIVE" | "ON_HOLD" | "COMPLETED" | "ARCHIVED";
export type SprintStatus = "PLANNED" | "ACTIVE" | "COMPLETED";
export type MilestoneStatus = "PENDING" | "AT_RISK" | "COMPLETED";
export type NotificationType =
  | "TASK_ASSIGNED"
  | "TASK_UPDATED"
  | "TASK_COMMENTED"
  | "SPRINT_STARTED"
  | "SPRINT_COMPLETED"
  | "MILESTONE_DUE"
  | "ADDED_TO_PROJECT"
  | "INVITATION";

export interface OrganizationSummary {
  id: string;
  name: string;
  slug: string;
  logoColor: string;
  description?: string | null;
}

export interface MembershipInfo {
  id: string;
  role: OrgRole;
  title: string | null;
  organizationId: string;
  organization: OrganizationSummary;
  department?: { id: string; name: string } | null;
}

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  avatarColor: string;
  timezone: string;
  createdAt: string;
  memberships: MembershipInfo[];
}

export interface Organization extends OrganizationSummary {
  settings: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  memberCount: number;
  projectCount: number;
  teamCount: number;
  departmentCount: number;
  role: OrgRole;
}

export interface UserSummary {
  id: string;
  name: string;
  email?: string;
  avatarColor: string;
}

export interface WorkflowColumn {
  id: string;
  projectId: string;
  name: string;
  position: number;
  isDone: boolean;
  wipLimit: number | null;
  taskCount?: number;
}

export interface TaskCategory {
  id: string;
  name: string;
  color: string;
}

export interface TaskAssignment {
  user: UserSummary;
}

export interface TaskDependencyLink {
  dependsOn: { id: string; number: number; title: string; column: { name: string; isDone: boolean } };
}

export interface TaskDependentLink {
  task: { id: string; number: number; title: string; column: { name: string; isDone: boolean } };
}

export interface Comment {
  id: string;
  taskId: string;
  body: string;
  createdAt: string;
  updatedAt: string;
  author: UserSummary;
}

export interface Attachment {
  id: string;
  taskId: string;
  filename: string;
  mimeType: string;
  size: number;
  createdAt: string;
  uploader: { id: string; name: string };
}

export interface TaskActivity {
  id: string;
  action: string;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  actor: UserSummary | null;
}

export interface Task {
  id: string;
  organizationId: string;
  projectId: string;
  columnId: string;
  categoryId: string | null;
  sprintId: string | null;
  number: number;
  title: string;
  description: string | null;
  priority: Priority;
  estimateHours: number | null;
  storyPoints: number | null;
  startDate: string | null;
  dueDate: string | null;
  completedAt: string | null;
  position: number;
  createdAt: string;
  updatedAt: string;
  column: WorkflowColumn;
  category: TaskCategory | null;
  sprint: { id: string; name: string; status: SprintStatus; startDate?: string; endDate?: string } | null;
  assignments: TaskAssignment[];
  createdBy?: UserSummary;
  dependencies?: TaskDependencyLink[];
  dependents?: TaskDependentLink[];
  comments?: Comment[];
  attachments?: Attachment[];
  activities?: TaskActivity[];
  project?: { id: string; name: string; key: string; color: string };
  _count?: { comments: number; attachments: number };
}

export interface Project {
  id: string;
  organizationId: string;
  teamId: string | null;
  name: string;
  key: string;
  description: string | null;
  objectives: string | null;
  status: ProjectStatus;
  priority: Priority;
  color: string;
  startDate: string | null;
  dueDate: string | null;
  ownerId: string;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
  owner?: UserSummary;
  team?: { id: string; name: string } | null;
  columns?: WorkflowColumn[];
  members?: ProjectMember[];
  milestones?: Milestone[];
  sprints?: Sprint[];
  _count?: { tasks: number; members: number; sprints?: number };
  taskStats?: { total: number; completed: number; progress: number };
}

export interface ProjectMember {
  id: string;
  userId: string;
  role: ProjectRole;
  addedAt: string;
  user: UserSummary;
}

export interface SprintStats {
  totalTasks: number;
  completedTasks: number;
  totalPoints: number;
  completedPoints: number;
  progress: number;
}

export interface Sprint {
  id: string;
  projectId: string;
  name: string;
  goal: string | null;
  startDate: string;
  endDate: string;
  status: SprintStatus;
  stats?: SprintStats;
  tasks?: Task[];
  project?: { id: string; name: string; key: string; color?: string };
}

export interface Milestone {
  id: string;
  projectId: string;
  name: string;
  description: string | null;
  dueDate: string;
  status: MilestoneStatus;
  completedAt: string | null;
}

export interface OrgMember {
  id: string;
  role: OrgRole;
  title: string | null;
  department: { id: string; name: string } | null;
  user: UserSummary & { email: string; timezone?: string };
  createdAt: string;
  isSelf: boolean;
}

export interface Department {
  id: string;
  name: string;
  description: string | null;
  lead: UserSummary | null;
  _count: { teams: number; members: number };
}

export interface Team {
  id: string;
  name: string;
  description: string | null;
  departmentId: string | null;
  lead: UserSummary | null;
  department: { id: string; name: string } | null;
  members: { id: string; userId: string; role: string; user: UserSummary }[];
  _count: { projects: number };
}

export interface Invitation {
  id: string;
  email: string;
  role: OrgRole;
  status: "PENDING" | "ACCEPTED" | "REVOKED" | "EXPIRED";
  token: string;
  expiresAt: string;
  createdAt: string;
  invitedBy?: { id: string; name: string } | null;
}

export interface Notification {
  id: string;
  organizationId: string;
  type: NotificationType;
  title: string;
  body: string | null;
  entityType: string | null;
  entityId: string | null;
  readAt: string | null;
  createdAt: string;
  organization?: { id: string; name: string; logoColor: string };
}

export interface Activity {
  id: string;
  action: string;
  entityType: string;
  entityId: string;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  actor: UserSummary | null;
  project?: { id: string; name: string; key: string } | null;
  taskId?: string | null;
}

export interface AuditLog {
  id: string;
  action: string;
  entityType: string | null;
  entityId: string | null;
  ip: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  actor: { id: string; name: string; email: string } | null;
}

export interface CalendarEvent {
  id: string;
  entityId: string;
  type: "task" | "milestone" | "sprint";
  title: string;
  date: string;
  endDate: string | null;
  project: { id: string; name: string; key: string; color: string };
  priority: Priority | null;
  status: string;
  isDone: boolean;
  assignees: UserSummary[];
  taskCount?: number;
}

export interface WorkloadMember {
  userId: string;
  name: string;
  email: string;
  avatarColor: string;
  role: OrgRole;
  title: string | null;
  department: string | null;
  openTasks: number;
  overdueTasks: number;
  urgentTasks: number;
  estimatedHours: number;
  overloaded: boolean;
}

export interface WorkloadResponse {
  members: WorkloadMember[];
  unassignedOpenTasks: number;
  totals: {
    members: number;
    openTasks: number;
    estimatedHours: number;
    overdueTasks: number;
    overloadedMembers: number;
  };
  thresholds: { openTasks: number; estimatedHours: number };
  note: string;
}

export interface Kpis {
  activeProjects: number;
  totalProjects: number;
  openTasks: number;
  completedTasks: number;
  completedInRange: number;
  overdueTasks: number;
  activeSprints: number;
  members: number;
  completionRate: number;
  onTimeRate: number;
  avgCycleTimeDays: number;
}

export interface OrgDashboard {
  kpis: Kpis;
  activeSprints: {
    id: string;
    name: string;
    project: { id: string; name: string; key: string };
    startDate: string;
    endDate: string;
    totalTasks: number;
    completedTasks: number;
    progress: number;
  }[];
  upcomingMilestones: {
    id: string;
    name: string;
    dueDate: string;
    status: MilestoneStatus;
    project: { id: string; name: string; key: string; color: string };
  }[];
  recentActivity: Activity[];
  workload: WorkloadResponse;
  completionTrend: { date: string; completed: number }[];
  projectStatus: { status: ProjectStatus; count: number }[];
  throughput: { week: string; completed: number; created: number }[];
  projects: (Project & { completedTasks: number; progress: number })[];
  note: string;
}

export interface OrgAnalytics extends OrgDashboard {
  generatedAt: string;
  rangeWeeks: number;
  priorityDistribution: { priority: Priority; count: number }[];
  velocity: {
    sprintId: string;
    name: string;
    project: { name: string; key: string };
    completedTasks: number;
    completedPoints: number;
    totalTasks: number;
  }[];
}

export interface ProjectAnalytics {
  project: { id: string; name: string; key: string; color: string; status: ProjectStatus; dueDate: string | null };
  kpis: {
    totalTasks: number;
    openTasks: number;
    completedTasks: number;
    overdueTasks: number;
    completionRate: number;
    avgCycleTimeDays: number;
    totalPoints: number;
    completedPoints: number;
    unassignedTasks: number;
  };
  columns: { id: string; name: string; position: number; isDone: boolean; count: number }[];
  byPriority: { priority: Priority; count: number }[];
  byAssignee: {
    userId: string;
    name: string;
    avatarColor: string;
    open: number;
    done: number;
    points: number;
  }[];
  completionTrend: { date: string; completed: number }[];
  throughput: { week: string; completed: number; created: number }[];
  sprints: {
    id: string;
    name: string;
    status: SprintStatus;
    startDate: string;
    endDate: string;
    totalTasks: number;
    completedTasks: number;
    completedPoints: number;
    progress: number;
  }[];
  milestones: Milestone[];
  note: string;
}

export interface SprintReport {
  sprint: Sprint & { project: { id: string; name: string; key: string; organizationId: string; color: string } };
  summary: {
    totalTasks: number;
    completedTasks: number;
    incompleteTasks: number;
    totalPoints: number;
    completedPoints: number;
    completionRate: number;
    pointCompletionRate: number;
  };
  burndown: { date: string; remainingTasks: number; remainingPoints: number; idealTasks: number }[];
  byColumn: Record<string, number>;
  incomplete: {
    id: string;
    number: number;
    title: string;
    priority: Priority;
    dueDate: string | null;
    column: { name: string };
    assignees: UserSummary[];
  }[];
  tasks: {
    id: string;
    number: number;
    title: string;
    priority: Priority;
    storyPoints: number | null;
    completedAt: string | null;
    column: { name: string; isDone: boolean };
    assignees: UserSummary[];
  }[];
}

export interface MyWorkResponse {
  tasks: Task[];
  summary: { total: number; open: number; completed: number; overdue: number; dueThisWeek: number };
}

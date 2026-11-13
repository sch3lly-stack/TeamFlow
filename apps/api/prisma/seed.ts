import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { PrismaClient, type Priority } from "@prisma/client";
import { config } from "dotenv";
import { hashPassword } from "../src/lib/password";

config({ path: path.resolve(process.cwd(), "../../.env") });
config();

const prisma = new PrismaClient();
const PASSWORD = process.env.SEED_DEMO_PASSWORD ?? "Password123!";

const day = 86_400_000;
const days = (offset: number) => new Date(Date.now() + offset * day);

type ColumnName = "Backlog" | "To Do" | "In Progress" | "In Review" | "Done";

async function main() {
  console.log("Seeding TeamFlow demo data...");
  const passwordHash = hashPassword(PASSWORD);

  await prisma.organization.deleteMany({
    where: { slug: { in: ["northwind-labs", "contoso-cloud"] } },
  });

  const userSpecs = [
    { email: "ada@northwind.dev", name: "Ada Lovelace", color: "#6366f1" },
    { email: "grace@northwind.dev", name: "Grace Hopper", color: "#8b5cf6" },
    { email: "linus@northwind.dev", name: "Linus Torvalds", color: "#f97316" },
    { email: "margaret@northwind.dev", name: "Margaret Hamilton", color: "#ec4899" },
    { email: "alan@northwind.dev", name: "Alan Turing", color: "#0ea5e9" },
    { email: "katherine@northwind.dev", name: "Katherine Johnson", color: "#14b8a6" },
    { email: "barbara@northwind.dev", name: "Barbara Liskov", color: "#eab308" },
    { email: "dennis@northwind.dev", name: "Dennis Ritchie", color: "#64748b" },
    { email: "oscar@contoso.dev", name: "Oscar Contoso", color: "#22c55e" },
    { email: "hedy@contoso.dev", name: "Hedy Lamarr", color: "#ef4444" },
  ];

  const users: Record<string, { id: string; name: string }> = {};
  for (const spec of userSpecs) {
    const user = await prisma.user.upsert({
      where: { email: spec.email },
      update: { name: spec.name, passwordHash, avatarColor: spec.color },
      create: {
        email: spec.email,
        name: spec.name,
        passwordHash,
        avatarColor: spec.color,
      },
    });
    users[spec.email] = { id: user.id, name: user.name };
  }

  const northwind = await prisma.organization.create({
    data: {
      name: "Northwind Labs",
      slug: "northwind-labs",
      description: "Product engineering organization building the Atlas platform.",
      logoColor: "#6366f1",
      settings: {
        weekStart: "monday",
        defaultPriority: "MEDIUM",
        workloadThresholds: { openTasks: 8, estimatedHours: 40 },
        notifications: { realtime: true, emailInvites: false },
      },
    },
  });

  const contoso = await prisma.organization.create({
    data: {
      name: "Contoso Cloud",
      slug: "contoso-cloud",
      description: "Cloud infrastructure and platform reliability.",
      logoColor: "#22c55e",
      settings: { weekStart: "monday", defaultPriority: "HIGH" },
    },
  });

  await prisma.taskCategory.createMany({
    data: [
      { organizationId: northwind.id, name: "Feature", color: "#6366f1" },
      { organizationId: northwind.id, name: "Bug", color: "#ef4444" },
      { organizationId: northwind.id, name: "Chore", color: "#64748b" },
      { organizationId: northwind.id, name: "Research", color: "#0ea5e9" },
      { organizationId: northwind.id, name: "Design", color: "#ec4899" },
      { organizationId: contoso.id, name: "Feature", color: "#6366f1" },
      { organizationId: contoso.id, name: "Bug", color: "#ef4444" },
    ],
  });

  const engineering = await prisma.department.create({
    data: {
      organizationId: northwind.id,
      name: "Engineering",
      description: "Platform, product and reliability engineering.",
      leadId: users["grace@northwind.dev"].id,
    },
  });
  const design = await prisma.department.create({
    data: {
      organizationId: northwind.id,
      name: "Product Design",
      description: "Design systems and product experience.",
      leadId: users["katherine@northwind.dev"].id,
    },
  });
  const cloudDept = await prisma.department.create({
    data: {
      organizationId: contoso.id,
      name: "Cloud Platform",
      description: "Infrastructure and developer platform.",
      leadId: users["oscar@contoso.dev"].id,
    },
  });

  const membershipSpecs = [
    ["ada@northwind.dev", "OWNER", "VP Engineering", engineering.id],
    ["grace@northwind.dev", "ADMIN", "Engineering Manager", engineering.id],
    ["linus@northwind.dev", "PROJECT_MANAGER", "Staff Engineer", engineering.id],
    ["margaret@northwind.dev", "TEAM_LEAD", "Platform Lead", engineering.id],
    ["alan@northwind.dev", "DEVELOPER", "Senior Backend Engineer", engineering.id],
    ["katherine@northwind.dev", "DEVELOPER", "Frontend Engineer", design.id],
    ["barbara@northwind.dev", "DEVELOPER", "Full-stack Engineer", engineering.id],
    ["dennis@northwind.dev", "VIEWER", "Product Analyst", design.id],
  ] as const;

  for (const [email, role, title, departmentId] of membershipSpecs) {
    await prisma.membership.create({
      data: {
        userId: users[email].id,
        organizationId: northwind.id,
        role,
        title,
        departmentId,
      },
    });
  }

  await prisma.membership.createMany({
    data: [
      {
        userId: users["oscar@contoso.dev"].id,
        organizationId: contoso.id,
        role: "OWNER",
        title: "CTO",
        departmentId: cloudDept.id,
      },
      {
        userId: users["hedy@contoso.dev"].id,
        organizationId: contoso.id,
        role: "DEVELOPER",
        title: "Platform Engineer",
        departmentId: cloudDept.id,
      },
    ],
  });

  const platformTeam = await prisma.team.create({
    data: {
      organizationId: northwind.id,
      departmentId: engineering.id,
      name: "Platform",
      description: "Owns API infrastructure and developer experience.",
      leadId: users["margaret@northwind.dev"].id,
      members: {
        create: [
          { userId: users["margaret@northwind.dev"].id, role: "LEAD" },
          { userId: users["alan@northwind.dev"].id },
          { userId: users["linus@northwind.dev"].id },
          { userId: users["barbara@northwind.dev"].id },
        ],
      },
    },
  });

  const webTeam = await prisma.team.create({
    data: {
      organizationId: northwind.id,
      departmentId: design.id,
      name: "Web Experience",
      description: "Design system and customer-facing web applications.",
      leadId: users["katherine@northwind.dev"].id,
      members: {
        create: [
          { userId: users["katherine@northwind.dev"].id, role: "LEAD" },
          { userId: users["barbara@northwind.dev"].id },
          { userId: users["dennis@northwind.dev"].id },
        ],
      },
    },
  });

  await prisma.team.create({
    data: {
      organizationId: northwind.id,
      departmentId: engineering.id,
      name: "Growth",
      description: "Experimentation and onboarding.",
      leadId: users["grace@northwind.dev"].id,
      members: {
        create: [
          { userId: users["grace@northwind.dev"].id, role: "LEAD" },
          { userId: users["dennis@northwind.dev"].id },
        ],
      },
    },
  });

  const cloudTeam = await prisma.team.create({
    data: {
      organizationId: contoso.id,
      departmentId: cloudDept.id,
      name: "Cloud Core",
      leadId: users["oscar@contoso.dev"].id,
      members: {
        create: [
          { userId: users["oscar@contoso.dev"].id, role: "LEAD" },
          { userId: users["hedy@contoso.dev"].id },
        ],
      },
    },
  });

  async function createProject(input: {
    organizationId: string;
    name: string;
    key: string;
    description: string;
    objectives: string;
    status: "PLANNING" | "ACTIVE" | "ON_HOLD" | "COMPLETED" | "ARCHIVED";
    priority: Priority;
    color: string;
    ownerEmail: string;
    teamId: string | null;
    startOffset: number;
    dueOffset: number;
    memberEmails: { email: string; role: "MANAGER" | "CONTRIBUTOR" | "VIEWER" }[];
  }) {
    const project = await prisma.project.create({
      data: {
        organizationId: input.organizationId,
        name: input.name,
        key: input.key,
        description: input.description,
        objectives: input.objectives,
        status: input.status,
        priority: input.priority,
        color: input.color,
        startDate: days(input.startOffset),
        dueDate: days(input.dueOffset),
        ownerId: users[input.ownerEmail].id,
        teamId: input.teamId,
      },
    });

    await prisma.workflowColumn.createMany({
      data: [
        { projectId: project.id, name: "Backlog", position: 0, isDone: false },
        { projectId: project.id, name: "To Do", position: 1, isDone: false },
        { projectId: project.id, name: "In Progress", position: 2, isDone: false },
        { projectId: project.id, name: "In Review", position: 3, isDone: false },
        { projectId: project.id, name: "Done", position: 4, isDone: true, wipLimit: null },
      ],
    });

    await prisma.projectMember.create({
      data: {
        projectId: project.id,
        userId: users[input.ownerEmail].id,
        role: "MANAGER",
      },
    });

    for (const member of input.memberEmails) {
      await prisma.projectMember.upsert({
        where: {
          projectId_userId: { projectId: project.id, userId: users[member.email].id },
        },
        update: { role: member.role },
        create: {
          projectId: project.id,
          userId: users[member.email].id,
          role: member.role,
        },
      });
    }

    return project;
  }

  const atlas = await createProject({
    organizationId: northwind.id,
    name: "Atlas API Platform",
    key: "ATLAS",
    description:
      "Multi-tenant API platform with organization isolation, audit trails and a public developer API.",
    objectives:
      "Ship the public beta, harden tenant isolation, and publish the first SDK. Reduce p95 latency below 180ms.",
    status: "ACTIVE",
    priority: "HIGH",
    color: "#6366f1",
    ownerEmail: "linus@northwind.dev",
    teamId: platformTeam.id,
    startOffset: -70,
    dueOffset: 45,
    memberEmails: [
      { email: "margaret@northwind.dev", role: "CONTRIBUTOR" },
      { email: "alan@northwind.dev", role: "CONTRIBUTOR" },
      { email: "barbara@northwind.dev", role: "CONTRIBUTOR" },
      { email: "dennis@northwind.dev", role: "VIEWER" },
    ],
  });

  const nimbus = await createProject({
    organizationId: northwind.id,
    name: "Nimbus Design System",
    key: "NIMBUS",
    description:
      "Accessible component library and design tokens shared across web properties.",
    objectives:
      "Deliver a WCAG AA component set, dark-mode tokens, and a documented contribution workflow.",
    status: "ACTIVE",
    priority: "MEDIUM",
    color: "#ec4899",
    ownerEmail: "katherine@northwind.dev",
    teamId: webTeam.id,
    startOffset: -40,
    dueOffset: 60,
    memberEmails: [
      { email: "barbara@northwind.dev", role: "CONTRIBUTOR" },
      { email: "alan@northwind.dev", role: "CONTRIBUTOR" },
      { email: "dennis@northwind.dev", role: "VIEWER" },
    ],
  });

  const mercury = await createProject({
    organizationId: northwind.id,
    name: "Mercury Mobile",
    key: "MERCURY",
    description: "Mobile companion app for field teams with offline-first sync.",
    objectives:
      "Validate scope with design partners and prepare the technical architecture for beta.",
    status: "PLANNING",
    priority: "MEDIUM",
    color: "#0ea5e9",
    ownerEmail: "grace@northwind.dev",
    teamId: null,
    startOffset: 10,
    dueOffset: 100,
    memberEmails: [
      { email: "linus@northwind.dev", role: "CONTRIBUTOR" },
      { email: "katherine@northwind.dev", role: "CONTRIBUTOR" },
      { email: "dennis@northwind.dev", role: "VIEWER" },
    ],
  });

  const cloud = await createProject({
    organizationId: contoso.id,
    name: "Cloud Control Plane",
    key: "CLOUD",
    description: "Internal control plane for provisioning customer environments.",
    objectives: "Automate staging environments and add cost guardrails.",
    status: "ACTIVE",
    priority: "HIGH",
    color: "#22c55e",
    ownerEmail: "oscar@contoso.dev",
    teamId: cloudTeam.id,
    startOffset: -25,
    dueOffset: 80,
    memberEmails: [{ email: "hedy@contoso.dev", role: "CONTRIBUTOR" }],
  });

  const atlasColumns = await prisma.workflowColumn.findMany({ where: { projectId: atlas.id } });
  const nimbusColumns = await prisma.workflowColumn.findMany({ where: { projectId: nimbus.id } });
  const mercuryColumns = await prisma.workflowColumn.findMany({ where: { projectId: mercury.id } });
  const cloudColumns = await prisma.workflowColumn.findMany({ where: { projectId: cloud.id } });

  const columnId = (
    columns: { id: string; name: string }[],
    name: ColumnName,
  ): string => {
    const column = columns.find((candidate) => candidate.name === name);
    if (!column) throw new Error(`Missing column ${name}`);
    return column.id;
  };

  const sprint11 = await prisma.sprint.create({
    data: {
      projectId: atlas.id,
      name: "Atlas Sprint 11",
      goal: "Tenant isolation hardening and auth rotation.",
      startDate: days(-20),
      endDate: days(-6),
      status: "COMPLETED",
    },
  });
  const sprint12 = await prisma.sprint.create({
    data: {
      projectId: atlas.id,
      name: "Atlas Sprint 12",
      goal: "Reporting, notifications, and board workflow controls.",
      startDate: days(-5),
      endDate: days(9),
      status: "ACTIVE",
    },
  });
  const nimbus6 = await prisma.sprint.create({
    data: {
      projectId: nimbus.id,
      name: "Nimbus Sprint 6",
      goal: "Token foundations and accessible focus states.",
      startDate: days(-18),
      endDate: days(-4),
      status: "COMPLETED",
    },
  });
  const nimbus7 = await prisma.sprint.create({
    data: {
      projectId: nimbus.id,
      name: "Nimbus Sprint 7",
      goal: "Data table API, dark mode, and modal polish.",
      startDate: days(-3),
      endDate: days(11),
      status: "ACTIVE",
    },
  });

  await prisma.milestone.createMany({
    data: [
      {
        projectId: atlas.id,
        name: "API v1 general availability",
        description: "Public SDK and stable versioned API.",
        dueDate: days(-6),
        status: "COMPLETED",
        completedAt: days(-6),
      },
      {
        projectId: atlas.id,
        name: "Public beta",
        description: "Invite-only beta with 20 design partners.",
        dueDate: days(14),
        status: "PENDING",
      },
      {
        projectId: atlas.id,
        name: "SOC 2 readiness review",
        description: "Audit log coverage and access review evidence.",
        dueDate: days(40),
        status: "AT_RISK",
      },
      {
        projectId: nimbus.id,
        name: "Nimbus v1.0 release",
        description: "Stable component set.",
        dueDate: days(-3),
        status: "COMPLETED",
        completedAt: days(-3),
      },
      {
        projectId: nimbus.id,
        name: "Core components complete",
        dueDate: days(20),
        status: "PENDING",
      },
      {
        projectId: nimbus.id,
        name: "Documentation site launch",
        dueDate: days(35),
        status: "PENDING",
      },
      {
        projectId: mercury.id,
        name: "Beta scope sign-off",
        dueDate: days(35),
        status: "PENDING",
      },
      {
        projectId: cloud.id,
        name: "Control plane GA",
        dueDate: days(60),
        status: "PENDING",
      },
    ],
  });

  const positionCounters = new Map<string, number>();
  const taskCounters = new Map<string, number>();

  async function createTask(input: {
    projectId: string;
    organizationId: string;
    columns: { id: string; name: string }[];
    column: ColumnName;
    title: string;
    description?: string;
    priority: Priority;
    assignees?: string[];
    dueOffset?: number;
    createdOffset?: number;
    completedOffset?: number;
    estimate?: number;
    points?: number;
    sprintId?: string;
    categoryName?: string;
    creatorEmail?: string;
  }) {
    const col = columnId(input.columns, input.column);
    const positionKey = `${input.projectId}:${col}`;
    const position = (positionCounters.get(positionKey) ?? 0) + 1000;
    positionCounters.set(positionKey, position);

    const number = (taskCounters.get(input.projectId) ?? 0) + 1;
    taskCounters.set(input.projectId, number);

    const category = await prisma.taskCategory.findFirst({
      where: { organizationId: input.organizationId, name: input.categoryName ?? "Feature" },
    });

    return prisma.task.create({
      data: {
        organizationId: input.organizationId,
        projectId: input.projectId,
        columnId: col,
        categoryId: category?.id ?? null,
        sprintId: input.sprintId ?? null,
        number,
        title: input.title,
        description: input.description,
        priority: input.priority,
        estimateHours: input.estimate ?? null,
        storyPoints: input.points ?? null,
        dueDate: input.dueOffset !== undefined ? days(input.dueOffset) : null,
        createdAt: days(input.createdOffset ?? -14),
        completedAt:
          input.column === "Done" ? days(input.completedOffset ?? -2) : null,
        position,
        createdById: users[input.creatorEmail ?? "linus@northwind.dev"].id,
        assignments: {
          create: (input.assignees ?? []).map((email) => ({
            userId: users[email].id,
          })),
        },
      },
    });
  }

  const atlasTasks = {
    isolation: await createTask({
      projectId: atlas.id,
      organizationId: northwind.id,
      columns: atlasColumns,
      column: "Done",
      title: "Design tenant isolation model",
      description:
        "Every tenant-owned row carries organizationId; project access resolves through the caller's membership.",
      priority: "URGENT",
      assignees: ["alan@northwind.dev"],
      dueOffset: -10,
      points: 5,
      estimate: 12,
      createdOffset: -35,
      completedOffset: -8,
      sprintId: sprint11.id,
      categoryName: "Research",
    }),
    rotation: await createTask({
      projectId: atlas.id,
      organizationId: northwind.id,
      columns: atlasColumns,
      column: "Done",
      title: "Implement refresh token rotation",
      description: "Opaque refresh tokens, SHA-256 storage, and replay revocation.",
      priority: "HIGH",
      assignees: ["alan@northwind.dev", "barbara@northwind.dev"],
      points: 3,
      estimate: 8,
      dueOffset: -5,
      createdOffset: -30,
      completedOffset: -7,
      sprintId: sprint11.id,
      categoryName: "Feature",
    }),
    rateLimit: await createTask({
      projectId: atlas.id,
      organizationId: northwind.id,
      columns: atlasColumns,
      column: "In Review",
      title: "Rate limit authentication endpoints",
      description: "Per-IP limits on login, registration, and refresh endpoints.",
      priority: "HIGH",
      assignees: ["alan@northwind.dev"],
      dueOffset: -1,
      points: 3,
      estimate: 5,
      createdOffset: -12,
      sprintId: sprint12.id,
      categoryName: "Feature",
    }),
    auditViewer: await createTask({
      projectId: atlas.id,
      organizationId: northwind.id,
      columns: atlasColumns,
      column: "In Progress",
      title: "Add organization audit log viewer",
      description: "Admins need paginated access to security-relevant audit events.",
      priority: "HIGH",
      assignees: ["barbara@northwind.dev"],
      dueOffset: 4,
      points: 5,
      estimate: 10,
      createdOffset: -8,
      sprintId: sprint12.id,
      categoryName: "Feature",
    }),
    csvExport: await createTask({
      projectId: atlas.id,
      organizationId: northwind.id,
      columns: atlasColumns,
      column: "In Progress",
      title: "Project report CSV export",
      description: "Export task-level project reports with sprint, assignee and estimate columns.",
      priority: "MEDIUM",
      assignees: ["margaret@northwind.dev"],
      dueOffset: 6,
      points: 3,
      estimate: 6,
      createdOffset: -7,
      sprintId: sprint12.id,
      categoryName: "Feature",
    }),
    rfc: await createTask({
      projectId: atlas.id,
      organizationId: northwind.id,
      columns: atlasColumns,
      column: "Backlog",
      title: "Webhook retry strategy RFC",
      description: "Exponential backoff with a dead-letter queue and replay tools.",
      priority: "LOW",
      assignees: ["linus@northwind.dev"],
      dueOffset: 12,
      points: 2,
      estimate: 4,
      createdOffset: -5,
      categoryName: "Research",
    }),
    notificationFix: await createTask({
      projectId: atlas.id,
      organizationId: northwind.id,
      columns: atlasColumns,
      column: "Done",
      title: "Fix duplicate notification on assignment",
      description: "Assignment notifications were emitted twice when a task moved.",
      priority: "MEDIUM",
      assignees: ["barbara@northwind.dev"],
      dueOffset: -1,
      points: 2,
      estimate: 3,
      createdOffset: -10,
      completedOffset: -2,
      sprintId: sprint12.id,
      categoryName: "Bug",
    }),
    reconnect: await createTask({
      projectId: atlas.id,
      organizationId: northwind.id,
      columns: atlasColumns,
      column: "To Do",
      title: "Socket reconnect backoff",
      description: "Add jittered reconnection and resync board state after reconnect.",
      priority: "MEDIUM",
      assignees: ["alan@northwind.dev"],
      dueOffset: 3,
      points: 2,
      estimate: 4,
      createdOffset: -4,
      categoryName: "Chore",
    }),
    wipLimits: await createTask({
      projectId: atlas.id,
      organizationId: northwind.id,
      columns: atlasColumns,
      column: "Backlog",
      title: "Add WIP limits to kanban columns",
      description: "Warn when a configurable WIP limit is exceeded.",
      priority: "LOW",
      assignees: ["margaret@northwind.dev"],
      dueOffset: 20,
      points: 2,
      estimate: 5,
      createdOffset: -3,
      categoryName: "Feature",
    }),
    risk: await createTask({
      projectId: atlas.id,
      organizationId: northwind.id,
      columns: atlasColumns,
      column: "In Progress",
      title: "Milestone risk indicator",
      description: "Flag milestones whose open work makes the due date unlikely.",
      priority: "MEDIUM",
      assignees: ["katherine@northwind.dev"],
      dueOffset: 5,
      points: 3,
      estimate: 6,
      createdOffset: -6,
      categoryName: "Feature",
    }),
    sso: await createTask({
      projectId: atlas.id,
      organizationId: northwind.id,
      columns: atlasColumns,
      column: "Backlog",
      title: "SSO discovery endpoint",
      description: "Support email-domain discovery for enterprise SSO.",
      priority: "HIGH",
      dueOffset: 15,
      points: 5,
      estimate: 12,
      createdOffset: -2,
      categoryName: "Feature",
    }),
    loadTest: await createTask({
      projectId: atlas.id,
      organizationId: northwind.id,
      columns: atlasColumns,
      column: "To Do",
      title: "Load test sprint report queries",
      description: "Validate report latency at 5k tasks per project.",
      priority: "MEDIUM",
      assignees: ["alan@northwind.dev"],
      dueOffset: 8,
      points: 3,
      estimate: 6,
      createdOffset: -3,
      sprintId: sprint12.id,
      categoryName: "Chore",
    }),
  };

  const nimbusTasks = {
    tokens: await createTask({
      projectId: nimbus.id,
      organizationId: northwind.id,
      columns: nimbusColumns,
      column: "Done",
      title: "Define color token scale",
      priority: "URGENT",
      assignees: ["katherine@northwind.dev"],
      dueOffset: -10,
      points: 3,
      estimate: 8,
      createdOffset: -28,
      completedOffset: -9,
      sprintId: nimbus6.id,
      categoryName: "Design",
    }),
    focus: await createTask({
      projectId: nimbus.id,
      organizationId: northwind.id,
      columns: nimbusColumns,
      column: "Done",
      title: "Accessible focus states",
      priority: "HIGH",
      assignees: ["barbara@northwind.dev"],
      dueOffset: -5,
      points: 3,
      estimate: 5,
      createdOffset: -24,
      completedOffset: -6,
      sprintId: nimbus6.id,
      categoryName: "Design",
    }),
    table: await createTask({
      projectId: nimbus.id,
      organizationId: northwind.id,
      columns: nimbusColumns,
      column: "In Progress",
      title: "Data table component API",
      description: "Sorting, selection, virtualization, and accessible column headers.",
      priority: "HIGH",
      assignees: ["katherine@northwind.dev"],
      dueOffset: 2,
      points: 5,
      estimate: 12,
      createdOffset: -9,
      sprintId: nimbus7.id,
      categoryName: "Feature",
    }),
    darkMode: await createTask({
      projectId: nimbus.id,
      organizationId: northwind.id,
      columns: nimbusColumns,
      column: "In Review",
      title: "Dark mode tokens",
      priority: "MEDIUM",
      assignees: ["barbara@northwind.dev"],
      dueOffset: 4,
      points: 3,
      estimate: 6,
      createdOffset: -7,
      sprintId: nimbus7.id,
      categoryName: "Design",
    }),
    tooltips: await createTask({
      projectId: nimbus.id,
      organizationId: northwind.id,
      columns: nimbusColumns,
      column: "To Do",
      title: "Chart tooltip consistency",
      priority: "MEDIUM",
      assignees: ["alan@northwind.dev"],
      dueOffset: 7,
      points: 2,
      estimate: 4,
      createdOffset: -5,
      categoryName: "Chore",
    }),
    guide: await createTask({
      projectId: nimbus.id,
      organizationId: northwind.id,
      columns: nimbusColumns,
      column: "Backlog",
      title: "Document component contribution guide",
      priority: "LOW",
      assignees: ["katherine@northwind.dev"],
      dueOffset: 14,
      points: 2,
      estimate: 4,
      createdOffset: -4,
      categoryName: "Chore",
    }),
    modalFix: await createTask({
      projectId: nimbus.id,
      organizationId: northwind.id,
      columns: nimbusColumns,
      column: "Done",
      title: "Fix modal scroll lock",
      priority: "MEDIUM",
      assignees: ["barbara@northwind.dev"],
      dueOffset: -2,
      points: 2,
      estimate: 2,
      createdOffset: -6,
      completedOffset: -1,
      sprintId: nimbus7.id,
      categoryName: "Bug",
    }),
    icons: await createTask({
      projectId: nimbus.id,
      organizationId: northwind.id,
      columns: nimbusColumns,
      column: "Backlog",
      title: "Icon set audit",
      priority: "LOW",
      dueOffset: 21,
      points: 1,
      estimate: 3,
      createdOffset: -3,
      categoryName: "Design",
    }),
  };

  await createTask({
    projectId: mercury.id,
    organizationId: northwind.id,
    columns: mercuryColumns,
    column: "Backlog",
    title: "Draft mobile release scope",
    priority: "HIGH",
    assignees: ["grace@northwind.dev"],
    dueOffset: 10,
    points: 3,
    estimate: 6,
    categoryName: "Research",
  });
  await createTask({
    projectId: mercury.id,
    organizationId: northwind.id,
    columns: mercuryColumns,
    column: "Backlog",
    title: "Evaluate push notification providers",
    priority: "MEDIUM",
    assignees: ["linus@northwind.dev"],
    dueOffset: 18,
    points: 3,
    estimate: 8,
    categoryName: "Research",
  });
  await createTask({
    projectId: mercury.id,
    organizationId: northwind.id,
    columns: mercuryColumns,
    column: "Backlog",
    title: "Offline sync architecture",
    priority: "HIGH",
    assignees: ["katherine@northwind.dev"],
    dueOffset: 25,
    points: 8,
    estimate: 20,
    categoryName: "Feature",
  });
  await createTask({
    projectId: mercury.id,
    organizationId: northwind.id,
    columns: mercuryColumns,
    column: "To Do",
    title: "Define beta cohort",
    priority: "LOW",
    assignees: ["dennis@northwind.dev"],
    dueOffset: 30,
    points: 2,
    estimate: 3,
    categoryName: "Research",
  });

  const cloudProvision = await createTask({
    projectId: cloud.id,
    organizationId: contoso.id,
    columns: cloudColumns,
    column: "Done",
    title: "Provision staging cluster",
    priority: "HIGH",
    assignees: ["hedy@contoso.dev"],
    points: 3,
    estimate: 6,
    createdOffset: -20,
    completedOffset: -4,
    categoryName: "Feature",
    creatorEmail: "oscar@contoso.dev",
  });
  const cloudTerraform = await createTask({
    projectId: cloud.id,
    organizationId: contoso.id,
    columns: cloudColumns,
    column: "In Progress",
    title: "Terraform module baseline",
    priority: "HIGH",
    assignees: ["hedy@contoso.dev"],
    dueOffset: 9,
    points: 5,
    estimate: 12,
    createdOffset: -12,
    categoryName: "Feature",
    creatorEmail: "hedy@contoso.dev",
  });
  await createTask({
    projectId: cloud.id,
    organizationId: contoso.id,
    columns: cloudColumns,
    column: "Backlog",
    title: "Cost guardrails",
    priority: "MEDIUM",
    assignees: ["oscar@contoso.dev"],
    dueOffset: 22,
    points: 3,
    estimate: 8,
    categoryName: "Feature",
    creatorEmail: "oscar@contoso.dev",
  });
  await createTask({
    projectId: cloud.id,
    organizationId: contoso.id,
    columns: cloudColumns,
    column: "To Do",
    title: "Incident runbook",
    priority: "LOW",
    assignees: ["oscar@contoso.dev", "hedy@contoso.dev"],
    dueOffset: 16,
    points: 2,
    estimate: 4,
    categoryName: "Chore",
    creatorEmail: "oscar@contoso.dev",
  });

  // Dependencies (blocked -> blocker), validated against cycles at runtime.
  await prisma.taskDependency.createMany({
    data: [
      { taskId: atlasTasks.rateLimit.id, dependsOnTaskId: atlasTasks.rotation.id },
      { taskId: atlasTasks.csvExport.id, dependsOnTaskId: atlasTasks.auditViewer.id },
      { taskId: atlasTasks.sso.id, dependsOnTaskId: atlasTasks.isolation.id },
      { taskId: nimbusTasks.darkMode.id, dependsOnTaskId: nimbusTasks.table.id },
      { taskId: cloudTerraform.id, dependsOnTaskId: cloudProvision.id },
    ],
  });

  await prisma.comment.createMany({
    data: [
      {
        taskId: atlasTasks.rateLimit.id,
        authorId: users["margaret@northwind.dev"].id,
        body: "The login limit should be per-IP and per-email so credential stuffing cannot bypass it with one signal.",
        createdAt: days(-2),
      },
      {
        taskId: atlasTasks.rateLimit.id,
        authorId: users["alan@northwind.dev"].id,
        body: "Added both keys with a stricter bucket for failed attempts. Ready for review.",
        createdAt: days(-1),
      },
      {
        taskId: atlasTasks.auditViewer.id,
        authorId: users["ada@northwind.dev"].id,
        body: "Please keep the audit viewer read-only and admin-scoped. It should not become a general activity feed.",
        createdAt: days(-1),
      },
      {
        taskId: atlasTasks.csvExport.id,
        authorId: users["dennis@northwind.dev"].id,
        body: "Could the export include the milestone name too? That makes the report usable in review meetings.",
        createdAt: days(-1),
      },
      {
        taskId: nimbusTasks.table.id,
        authorId: users["barbara@northwind.dev"].id,
        body: "Keyboard navigation is the risky part. Suggest we test with VoiceOver before closing.",
        createdAt: days(-1),
      },
    ],
  });

  // A real stored demo attachment so the upload/download path is exercised.
  // Containerized seeding can disable this when the upload volume is not shared.
  if (process.env.SEED_DISABLE_ATTACHMENT !== "true") {
    try {
      const uploadDir = path.resolve(process.cwd(), "uploads");
      await mkdir(uploadDir, { recursive: true });
      const storageKey = randomUUID();
      const contents =
        "# Tenant isolation notes\n\nEvery query resolves organizationId from the caller's membership.\nCross-organization identifiers return 404.\n";
      await writeFile(path.join(uploadDir, storageKey), contents, "utf8");
      await prisma.attachment.create({
        data: {
          organizationId: northwind.id,
          taskId: atlasTasks.auditViewer.id,
          uploaderId: users["ada@northwind.dev"].id,
          filename: "tenant-isolation-notes.md",
          mimeType: "text/markdown",
          size: Buffer.byteLength(contents),
          storageKey,
        },
      });
    } catch (error) {
      console.warn("Skipped demo attachment:", error instanceof Error ? error.message : error);
    }
  }

  await prisma.activityLog.createMany({
    data: [
      {
        organizationId: northwind.id,
        projectId: atlas.id,
        taskId: atlasTasks.auditViewer.id,
        actorId: users["barbara@northwind.dev"].id,
        action: "task.moved",
        entityType: "Task",
        entityId: atlasTasks.auditViewer.id,
        metadata: { number: 4, title: "Add organization audit log viewer", from: "To Do", to: "In Progress" },
        createdAt: days(-1),
      },
      {
        organizationId: northwind.id,
        projectId: atlas.id,
        taskId: atlasTasks.notificationFix.id,
        actorId: users["barbara@northwind.dev"].id,
        action: "task.moved",
        entityType: "Task",
        entityId: atlasTasks.notificationFix.id,
        metadata: { number: 7, title: "Fix duplicate notification on assignment", from: "In Review", to: "Done" },
        createdAt: days(-2),
      },
      {
        organizationId: northwind.id,
        projectId: nimbus.id,
        taskId: nimbusTasks.darkMode.id,
        actorId: users["katherine@northwind.dev"].id,
        action: "comment.created",
        entityType: "Comment",
        entityId: "seed-comment",
        metadata: { task: "NIMBUS-4", excerpt: "Dark tokens are ready for review" },
        createdAt: days(-2),
      },
      {
        organizationId: northwind.id,
        projectId: atlas.id,
        actorId: users["linus@northwind.dev"].id,
        action: "sprint.created",
        entityType: "Sprint",
        entityId: sprint12.id,
        metadata: { name: "Atlas Sprint 12" },
        createdAt: days(-6),
      },
      {
        organizationId: northwind.id,
        projectId: atlas.id,
        actorId: users["ada@northwind.dev"].id,
        action: "milestone.created",
        entityType: "Milestone",
        entityId: "seed-milestone",
        metadata: { name: "SOC 2 readiness review" },
        createdAt: days(-10),
      },
    ],
  });

  await prisma.notification.createMany({
    data: [
      {
        organizationId: northwind.id,
        userId: users["alan@northwind.dev"].id,
        type: "TASK_ASSIGNED",
        title: "ATLAS-3 assigned to you",
        body: "Rate limit authentication endpoints",
        entityType: "Task",
        entityId: atlasTasks.rateLimit.id,
        createdAt: days(-2),
      },
      {
        organizationId: northwind.id,
        userId: users["alan@northwind.dev"].id,
        type: "TASK_COMMENTED",
        title: "New comment on ATLAS-3",
        body: "The login limit should be per-IP and per-email...",
        entityType: "Task",
        entityId: atlasTasks.rateLimit.id,
        createdAt: days(-2),
      },
      {
        organizationId: northwind.id,
        userId: users["barbara@northwind.dev"].id,
        type: "TASK_ASSIGNED",
        title: "ATLAS-4 assigned to you",
        body: "Add organization audit log viewer",
        entityType: "Task",
        entityId: atlasTasks.auditViewer.id,
        createdAt: days(-3),
      },
      {
        organizationId: northwind.id,
        userId: users["ada@northwind.dev"].id,
        type: "SPRINT_STARTED",
        title: "Atlas API Platform: Atlas Sprint 12 started",
        body: "Reporting, notifications, and board workflow controls.",
        entityType: "Sprint",
        entityId: sprint12.id,
        createdAt: days(-5),
      },
      {
        organizationId: contoso.id,
        userId: users["oscar@contoso.dev"].id,
        type: "SPRINT_COMPLETED",
        title: "Cloud Control Plane sprint completed",
        body: "Staging cluster automation is ready.",
        entityType: "Project",
        entityId: cloud.id,
        createdAt: days(-3),
      },
    ],
  });

  await prisma.auditLog.createMany({
    data: [
      {
        organizationId: northwind.id,
        actorId: users["ada@northwind.dev"].id,
        action: "auth.login",
        entityType: "User",
        entityId: users["ada@northwind.dev"].id,
        ip: "127.0.0.1",
        createdAt: days(-1),
      },
      {
        organizationId: northwind.id,
        actorId: users["grace@northwind.dev"].id,
        action: "member.role_updated",
        entityType: "Membership",
        entityId: "seed-membership",
        metadata: { before: "DEVELOPER", after: "PROJECT_MANAGER" },
        createdAt: days(-4),
      },
    ],
  });

  await prisma.invitation.create({
    data: {
      organizationId: northwind.id,
      email: "riley@northwind.dev",
      role: "DEVELOPER",
      token: "demo-invitation-token-northwind",
      invitedById: users["grace@northwind.dev"].id,
      expiresAt: days(7),
    },
  });

  for (const [projectId, count] of taskCounters.entries()) {
    await prisma.project.update({
      where: { id: projectId },
      data: { taskCounter: count },
    });
  }

  console.log("\nDemo data ready.");
  console.log("  Northwind Labs (2 active projects, 8 people, 2 sprints, 28 tasks)");
  console.log("  Contoso Cloud  (1 project, 2 people, 4 tasks)");
  console.log("\nSign in with:");
  console.log("  ada@northwind.dev       / Password123!   (Owner)");
  console.log("  grace@northwind.dev     / Password123!   (Admin)");
  console.log("  linus@northwind.dev     / Password123!   (Project Manager)");
  console.log("  alan@northwind.dev      / Password123!   (Developer)");
  console.log("  dennis@northwind.dev    / Password123!   (Read-only)");
  console.log("  oscar@contoso.dev       / Password123!   (Second organization owner)");
  console.log("\nPassword source: SEED_DEMO_PASSWORD\n");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

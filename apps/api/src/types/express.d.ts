import type { Membership } from "@prisma/client";

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        email: string;
        name: string;
        avatarColor: string;
        timezone: string;
      };
      membership?: Membership;
      organizationId?: string;
    }
  }
}

export {};

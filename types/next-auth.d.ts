import type { DefaultSession } from "next-auth";
import type { RoleCode } from "@/lib/types";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: RoleCode;
    } & DefaultSession["user"];
  }

  interface User {
    role: RoleCode;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string;
    role?: RoleCode;
  }
}

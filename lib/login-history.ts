import { promises as fs } from "node:fs";
import path from "node:path";
import { getPrismaClient, isDatabaseAvailable } from "./prisma";
import { getWritableStoragePath } from "./runtime-storage";

export type LoginHistoryEntry = {
  id: string;
  ipAddress: string;
  loggedAt: string;
  status: string;
};

type StoredLoginHistoryFile = Record<string, LoginHistoryEntry[]>;

const FILE_NAME = "login-history.json";

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function getFilePath(): string {
  return getWritableStoragePath(FILE_NAME);
}

async function readFileStore(): Promise<StoredLoginHistoryFile> {
  try {
    const raw = await fs.readFile(getFilePath(), "utf8");
    const parsed = JSON.parse(raw) as StoredLoginHistoryFile;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

async function writeFileStore(data: StoredLoginHistoryFile): Promise<void> {
  const filePath = getFilePath();
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(data, null, 2), "utf8");
}

async function appendFileHistory(email: string, entry: LoginHistoryEntry): Promise<void> {
  const store = await readFileStore();
  const key = normalizeEmail(email);
  const rows = store[key] ?? [];
  store[key] = [entry, ...rows];
  await writeFileStore(store);
}

async function readFileHistory(email: string): Promise<LoginHistoryEntry[]> {
  const store = await readFileStore();
  return store[normalizeEmail(email)] ?? [];
}

export async function recordLoginHistory(input: {
  userId?: string | null;
  email: string;
  ipAddress: string;
  status?: string;
}): Promise<void> {
  const email = normalizeEmail(input.email);
  const status = input.status ?? "SUCCESS";
  const userId = input.userId && input.userId !== "env-admin" ? input.userId : null;

  if (await isDatabaseAvailable()) {
    const prisma = getPrismaClient();
    if (prisma) {
      try {
        await prisma.loginHistory.create({
          data: {
            userId,
            email,
            ipAddress: input.ipAddress,
            status,
          },
        });
        return;
      } catch {
        // Fall through to file storage when DB write fails.
      }
    }
  }

  await appendFileHistory(email, {
    id: `file-${Date.now()}`,
    ipAddress: input.ipAddress,
    loggedAt: new Date().toISOString(),
    status,
  });
}

export async function getLoginHistoryForEmail(email: string): Promise<LoginHistoryEntry[]> {
  const normalized = normalizeEmail(email);
  if (!normalized) return [];

  if (await isDatabaseAvailable()) {
    const prisma = getPrismaClient();
    if (prisma) {
      try {
        const rows = await prisma.loginHistory.findMany({
          where: { email: normalized },
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            ipAddress: true,
            status: true,
            createdAt: true,
          },
        });

        return rows.map((row) => ({
          id: row.id,
          ipAddress: row.ipAddress,
          status: row.status,
          loggedAt: row.createdAt.toISOString(),
        }));
      } catch {
        // Fall through to file storage.
      }
    }
  }

  return readFileHistory(normalized);
}

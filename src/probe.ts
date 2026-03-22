/**
 * API 探測腳本 — 驗證 Focus To-Do API 端點
 */
import "dotenv/config";
import { randomUUID } from "crypto";

const BASE_URL = "https://app.hk1.focustodo.net";

interface LoginResponse {
  status: number;
  acct?: string;
  jsessionId?: string;
  uid?: string;
  pid?: string;
  name?: string;
  portrait?: string;
  expiredDate?: number;
  avatarTimestamp?: number;
  [key: string]: unknown;
}

interface Credentials {
  cookies: string;
  acct: string;
  name: string;
  pid: string;
  uid: string;
}

async function login(): Promise<{ creds: Credentials; response: LoginResponse }> {
  const account = process.env.FOCUSTODO_ACCOUNT;
  const password = process.env.FOCUSTODO_PASSWORD;

  if (!account || !password) {
    throw new Error("Missing FOCUSTODO_ACCOUNT or FOCUSTODO_PASSWORD in .env");
  }

  console.log(`\n🔑 嘗試登入: ${account}`);

  const body = new URLSearchParams({
    account,
    password,
    client: "chrome-extension",
  });

  const res = await fetch(`${BASE_URL}/v63/user/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
    },
    body: body.toString(),
  });

  const setCookies = res.headers.getSetCookie?.() || [];
  const cookieStr = setCookies.map((c) => c.split(";")[0]).join("; ");

  const data = (await res.json()) as LoginResponse;

  console.log(`📡 HTTP ${res.status} | status=${data.status}`);

  if (data.status !== 0) {
    throw new Error(`Login failed: status=${data.status}`);
  }

  const creds: Credentials = {
    cookies: cookieStr,
    acct: data.acct || "",
    name: data.name || "",
    pid: data.pid || "",
    uid: data.uid || "",
  };

  console.log(`✅ 登入成功! acct=${creds.acct}`);
  return { creds, response: data };
}

async function sync(creds: Credentials) {
  console.log(`\n📥 嘗試同步資料 (timestamp=0 = 全量同步)...`);

  // 根據逆向分析，sync 用 JSON body
  const syncPayload = {
    timestamp: 0,
    clientId: randomUUID(),
    client: "focustodo-mcp",
    projects: [],
    tasks: [],
    subtasks: [],
    pomodoros: [],
    schedules: [],
    acct: creds.acct,
    name: creds.name,
    pid: creds.pid,
    uid: creds.uid,
  };

  // 先試 JSON 格式
  let res = await fetch(`${BASE_URL}/v64/sync`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json; charset=UTF-8",
      Cookie: creds.cookies,
    },
    body: JSON.stringify(syncPayload),
  });

  let data = (await res.json()) as Record<string, unknown>;
  console.log(`📡 [JSON] HTTP ${res.status} | keys:`, Object.keys(data));

  // 如果 JSON 格式沒有回傳資料，試 form-urlencoded
  if (!data.tasks && !data.projects) {
    console.log(`\n📥 JSON 格式沒回傳資料，改試 form-urlencoded...`);

    const formBody = new URLSearchParams({
      timestamp: "0",
      clientId: randomUUID(),
      client: "focustodo-mcp",
      projects: "[]",
      tasks: "[]",
      subtasks: "[]",
      pomodoros: "[]",
      schedules: "[]",
      acct: creds.acct,
      name: creds.name,
      pid: creds.pid,
      uid: creds.uid,
    });

    res = await fetch(`${BASE_URL}/v64/sync`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        Cookie: creds.cookies,
      },
      body: formBody.toString(),
    });

    data = (await res.json()) as Record<string, unknown>;
    console.log(`📡 [Form] HTTP ${res.status} | keys:`, Object.keys(data));
  }

  // Print summary
  const printArray = (key: string, emoji: string, label: string) => {
    const arr = data[key];
    if (Array.isArray(arr)) {
      console.log(`${emoji} ${label}: ${arr.length} 個`);
      if (arr.length > 0) {
        console.log(`${emoji} 範例:`, JSON.stringify(arr[0], null, 2));
      }
    }
  };

  printArray("projects", "📁", "Projects");
  printArray("tasks", "📋", "Tasks");
  printArray("subtasks", "📝", "Subtasks");
  printArray("pomodoros", "🍅", "Pomodoros");
  printArray("schedules", "📅", "Schedules");

  // Also check for syncXxx variants
  printArray("syncProjects", "📁", "syncProjects");
  printArray("syncTasks", "📋", "syncTasks");
  printArray("syncPomodoros", "🍅", "syncPomodoros");

  if (data.timestamp) {
    console.log(`⏱️ Server timestamp: ${data.timestamp}`);
  }

  // Write full response to file for analysis
  const fs = await import("fs");
  fs.writeFileSync(
    "probe-sync-response.json",
    JSON.stringify(data, null, 2),
    "utf-8"
  );
  console.log(`\n💾 完整回應已存到 probe-sync-response.json`);

  return data;
}

async function main() {
  try {
    console.log("=== Focus To-Do API 探測 ===\n");

    const { creds } = await login();
    await sync(creds);

    console.log("\n=== 探測完成 ===");
  } catch (err) {
    console.error("❌ 探測失敗:", err);
  }
}

main();

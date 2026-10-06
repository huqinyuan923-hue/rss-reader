import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";

// Serverless 环境走 Neon HTTP 驱动；所有查询经 Drizzle 参数绑定
const sql = neon(process.env.DATABASE_URL!);
export const db = drizzle(sql, { schema });

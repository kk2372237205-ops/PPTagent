import { Pool } from "pg";

type RegisteredUserInput = {
  localUserId: string;
  phone: string;
  registeredAt: Date;
  ip?: string | null;
  userAgent?: string | null;
};

type AppointmentInput = {
  localConsultationId: string;
  localUserId: string;
  phone: string;
  budget: string;
  status: string;
  submittedAt: Date;
};

const globalForSupabase = globalThis as unknown as {
  supabasePool?: Pool;
};

function getPool() {
  const connectionString = process.env.SUPABASE_DATABASE_URL?.trim();
  if (!connectionString) return null;
  if (!/^postgres(?:ql)?:\/\//i.test(connectionString)) {
    console.error(
      "[Supabase sync] SUPABASE_DATABASE_URL must be a PostgreSQL Session pooler URI.",
    );
    return null;
  }

  if (!globalForSupabase.supabasePool) {
    globalForSupabase.supabasePool = new Pool({
      connectionString,
      max: 5,
      idleTimeoutMillis: 10_000,
      connectionTimeoutMillis: 8_000,
      ssl: { rejectUnauthorized: false },
      application_name: "wzlcf-web",
    });
  }

  return globalForSupabase.supabasePool;
}

async function safelySync(label: string, action: (pool: Pool) => Promise<void>) {
  const pool = getPool();
  if (!pool) return false;

  try {
    await action(pool);
    return true;
  } catch (error) {
    console.error(`[Supabase sync] ${label} failed`, error);
    return false;
  }
}

export async function syncRegisteredUser(input: RegisteredUserInput) {
  return safelySync("registered user", async (pool) => {
    await pool.query(
      `
        insert into public.registered_users (
          local_user_id,
          phone,
          registered_at,
          last_login_at,
          metadata
        )
        values ($1, $2, $3, now(), $4::jsonb)
        on conflict (phone) do update
        set local_user_id = excluded.local_user_id,
            last_login_at = now(),
            metadata = public.registered_users.metadata || excluded.metadata
      `,
      [
        input.localUserId,
        input.phone,
        input.registeredAt,
        JSON.stringify({
          lastIp: input.ip ?? null,
          lastUserAgent: input.userAgent ?? null,
        }),
      ],
    );
  });
}

export async function syncAppointment(input: AppointmentInput) {
  return safelySync("appointment", async (pool) => {
    await pool.query(
      `
        insert into public.appointments (
          local_consultation_id,
          registration_id,
          phone,
          budget,
          status,
          form_data,
          submitted_at
        )
        select
          $1,
          registered_users.id,
          $3,
          $4,
          $5,
          $6::jsonb,
          $7
        from public.registered_users
        where registered_users.local_user_id = $2
        on conflict (local_consultation_id) do update
        set budget = excluded.budget,
            status = excluded.status,
            form_data = excluded.form_data
      `,
      [
        input.localConsultationId,
        input.localUserId,
        input.phone,
        input.budget,
        input.status,
        JSON.stringify({ budget: input.budget, source: "budget_consultation" }),
        input.submittedAt,
      ],
    );
  });
}

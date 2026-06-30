import nextEnv from "@next/env";
import { PrismaClient } from "@prisma/client";
import pg from "pg";

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());

const connectionString = process.env.SUPABASE_DATABASE_URL?.trim();
if (!connectionString || !/^postgres(?:ql)?:\/\//i.test(connectionString)) {
  throw new Error("SUPABASE_DATABASE_URL must be a PostgreSQL connection string.");
}

const prisma = new PrismaClient();
const pool = new pg.Pool({
  connectionString,
  max: 2,
  ssl: { rejectUnauthorized: false },
  application_name: "wzlcf-backfill",
});

try {
  const users = await prisma.user.findMany({
    include: {
      consultations: true,
    },
  });

  const client = await pool.connect();
  try {
    await client.query("begin");

    let appointmentCount = 0;
    for (const user of users) {
      const registration = await client.query(
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
          returning id
        `,
        [
          user.id,
          user.phone,
          user.createdAt,
          JSON.stringify({ source: "existing_user_backfill" }),
        ],
      );

      for (const consultation of user.consultations) {
        await client.query(
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
            values ($1, $2, $3, $4, $5, $6::jsonb, $7)
            on conflict (local_consultation_id) do update
            set registration_id = excluded.registration_id,
                phone = excluded.phone,
                budget = excluded.budget,
                status = excluded.status,
                form_data = excluded.form_data
          `,
          [
            consultation.id,
            registration.rows[0].id,
            user.phone,
            consultation.budget,
            consultation.status,
            JSON.stringify({
              budget: consultation.budget,
              source: "existing_consultation_backfill",
            }),
            consultation.createdAt,
          ],
        );
        appointmentCount += 1;
      }
    }

    await client.query("commit");
    console.log(
      `Supabase sync complete: ${users.length} users, ${appointmentCount} appointments`,
    );
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
} finally {
  await Promise.all([prisma.$disconnect(), pool.end()]);
}

import ClientApp from "@/components/client-app";
import { currentUser } from "@/lib/auth";
import { db } from "@/lib/db";

export default async function Home() {
  const user = await currentUser();
  if (!user) return <ClientApp initialUser={null} />;

  const details = await db.user.findUnique({
    where: { id: user.id },
    include: {
      sessions: { orderBy: { createdAt: "desc" } },
      services: {
        orderBy: { purchasedAt: "desc" },
        include: { versions: { orderBy: { version: "desc" } }, asset: true }
      },
      assets: {
        orderBy: { createdAt: "desc" },
        include: { service: { include: { versions: { orderBy: { version: "desc" } } } } }
      },
      consultations: {
        orderBy: { updatedAt: "desc" },
        include: {
          messages: {
            orderBy: { createdAt: "asc" },
            include: { attachments: true }
          }
        }
      }
    }
  });

  return <ClientApp initialUser={JSON.parse(JSON.stringify(details))} />;
}

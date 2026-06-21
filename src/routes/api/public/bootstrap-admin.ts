import { createFileRoute } from "@tanstack/react-router";

/**
 * O bootstrap público foi encerrado após a criação do primeiro administrador.
 * Novos usuários devem ser criados exclusivamente pela área administrativa.
 */
export const Route = createFileRoute("/api/public/bootstrap-admin")({
  server: {
    handlers: {
      POST: async () => {
        return Response.json({ error: "Endpoint desativado." }, { status: 404 });
      },
    },
  },
});

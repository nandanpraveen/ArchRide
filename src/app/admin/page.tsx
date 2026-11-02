import { notFound, redirect } from "next/navigation";
import { Alert, Stack, Typography } from "@mui/material";
import { checkAdmin } from "@/lib/admin/guard";

export default async function AdminPage() {
  const check = await checkAdmin();

  if (!check.ok && check.reason === "signed-out") redirect("/sign-in");
  // Non-admins get a plain 404 so the page does not advertise itself.
  if (!check.ok && check.reason === "forbidden") notFound();
  if (!check.ok) {
    return (
      <Alert severity="warning">
        Admin access could not be verified right now. Try again later.
      </Alert>
    );
  }

  return (
    <Stack spacing={3}>
      <Typography component="h1" variant="h1">
        Admin
      </Typography>
      <Typography color="text.secondary">
        Restricted maintenance tools. Feed health, manual notices, and data corrections will be
        added here.
      </Typography>
    </Stack>
  );
}

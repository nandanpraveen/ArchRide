import ProfileUI from "./profileUI";
import { getAccount } from "../get-user";

export default async function ProfilePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const [{ user, unavailable }, params] = await Promise.all([
    getAccount(),
    searchParams,
  ]);
  return (
    <ProfileUI
      userSignedIn={!!user}
      userEmail={user?.email ?? ""}
      unavailable={unavailable}
      signOutFailed={params.error === "sign-out"}
    />
  );
}

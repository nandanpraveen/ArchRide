import { createClient } from "@/lib/supabase/server";
import ProfileUI from "./profileUI";

export default async function ProfilePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <ProfileUI userSignedIn={user !== null} userEmail={user?.email ?? ""} />
  );
}

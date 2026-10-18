import ProfileUI from "./profileUI";
import { getUser } from "../get-user";
import { User } from "@supabase/supabase-js";

export default async function ProfilePage() {
  const user = await getUser();
  return (
    <ProfileUI userSignedIn={user !== null} userEmail={user?.email ?? ""} />
  );
}

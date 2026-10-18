"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { cookies } from "next/headers";

export async function signOut() {
  const cookieStore = await cookies();
  if (cookieStore.has("guest")) {
    cookieStore.delete("guest");
  }
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/sign-in");
}

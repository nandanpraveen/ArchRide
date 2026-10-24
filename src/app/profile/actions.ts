"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server-client";

export async function signOut() {
  let failed = false;
  try {
    const supabase = await createClient();
    const { error } = await supabase.auth.signOut();
    failed = !!error;
  } catch {
    failed = true;
  }
  if (failed) redirect("/profile?error=sign-out");
  revalidatePath("/", "layout");
  redirect("/sign-in");
}

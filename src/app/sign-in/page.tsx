import React from "react";
import AccountForm from "../account-form";
import { getUser } from "../get-user";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
const page = async () => {
  const user = await getUser();
  const cookieStore = await cookies();
  if (cookieStore.has("guest") || user) {
    redirect("/");
  }

  return <AccountForm formMode={"sign-in"}></AccountForm>;
};

export default page;

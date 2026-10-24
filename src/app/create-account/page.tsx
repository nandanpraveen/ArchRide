import { redirect } from "next/navigation";
import AccountForm from "../account-form";
import { getUser } from "../get-user";

export default async function CreateAccountPage() {
  if (await getUser()) redirect("/profile");
  return <AccountForm formMode="create-account" />;
}

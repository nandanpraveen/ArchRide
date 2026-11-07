import { Suspense } from "react";
import { Skeleton } from "@mui/material";
import { AccountForm } from "@/components/account-form";
export default function CreateAccountPage() { return <Suspense fallback={<Skeleton height={400}/>}><AccountForm mode="create-account"/></Suspense>; }

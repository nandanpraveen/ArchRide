import { Suspense } from "react";
import { Skeleton } from "@mui/material";
import { AccountForm } from "@/components/account-form";
export default function SignInPage() { return <Suspense fallback={<Skeleton height={360}/>}><AccountForm mode="sign-in"/></Suspense>; }

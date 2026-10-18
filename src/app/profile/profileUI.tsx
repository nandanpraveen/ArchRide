"use client";
import { Alert, Button, Stack, Typography } from "@mui/material";
import { EmptyState } from "@/components/empty-state";
import { useEffect, useState } from "react";
import { TextField } from "@mui/material";
import { signOut } from "./actions";

interface profileProps {
  userSignedIn: boolean;
  userEmail: string;
}

export default function ProfileUI({ userSignedIn, userEmail }: profileProps) {
  const [signedIn, setSignedIn] = useState<boolean>(userSignedIn);
  const [email, setEmail] = useState<string>(userEmail);
  useEffect(() => {
    setEmail(userEmail);
  }, [userEmail]);

  const handleSignOut = (e: React.MouseEvent) => {
    e.preventDefault();
    signOut();
  };
  return (
    <Stack spacing={3}>
      <Typography component="h1" variant="h1">
        Profile
      </Typography>

      {signedIn ? (
        <div className="flex flex-col gap-6 justify-center items-center">
          <div className="flex flex-col w-full gap-2 ">
            <p>Email</p>
            <TextField defaultValue={email} disabled className="" />
          </div>

          <Button onClick={handleSignOut} className="">
            Sign Out
          </Button>
        </div>
      ) : (
        <div className=" flex flex-col gap-4">
          <Alert severity="info">
            You are browsing as a guest. Public transit information will be
            available without an account.
          </Alert>
          <EmptyState
            title="Travel your way"
            description="Account sign-in and personal preferences are being prepared. Your class schedule and saved journeys will be private, and location sharing will always be optional."
            action="Back to Home"
            href="/"
          />
          <Button onClick={handleSignOut} className="">
            Sign Out
          </Button>
        </div>
      )}
    </Stack>
  );
}

"use client";
import React from "react";
import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/browser-client";
import { User } from "@supabase/supabase-js";
import { redirect, useRouter } from "next/navigation";
import { guestLogin } from "./sign-in/actions";

interface FormProps {
  formMode: "create-account" | "sign-in";
}
const AccountForm = ({ formMode }: FormProps) => {
  //Variable Setup
  const router = useRouter();
  const [loading, setLoading] = useState<boolean>(false); //Currently not implemented
  const [emailConfirmation, setEmailConfirmation] = useState<boolean>(true); //Currently unused
  const [email, setEmail] = useState<string>("");
  const [message, setMessage] = useState<string>("");
  const [password, setPassword] = useState<string>("");
  const [confirmedPassword, setConfirmedPassword] = useState<string>("");
  const [user, setUser] = useState<User | null>(null);
  const [mode, setMode] = useState<string>(formMode);
  const accountCreationMessage =
    "Just one more step, and you'll be on your way!";
  const signUpMessage = "Let's get you signed in";

  const [headerMessage, SetHeaderMessage] = useState<string>(
    formMode === "create-account" ? accountCreationMessage : signUpMessage,
  );

  const goToHomePage = () => {
    router.push("/");
    router.refresh();
  };

  const handleFormSubmission = async (
    e: React.MouseEvent<HTMLElement>,
    isGuest: boolean = false,
  ) => {
    e.preventDefault();
    console.log("click ", isGuest);
    if (!isGuest) {
      console.log("non guest Login");

      //Account creation
      if (mode === "create-account") {
        if (confirmedPassword === password) {
          processForm();
        } else {
          setMessage("Passwords do not match. Please try again.");
        }
        //Sign in
      } else {
        processForm();
      }
    }
    //Guest
    else {
      console.log("guest Login");
      await guestLogin();
    }
  };

  const processForm = async () => {
    const supabase = createClient();
    setMessage("");
    // setLoading(true);
    if (mode === "create-account") {
      const { data, error } = await supabase.auth.signUp({
        email: email.toLowerCase(),
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/confirm`,
        },
      });

      if (error) {
        //Failed account creation
        return setMessage(error.message);
      } else {
        //Successful account creation
        setUser(data.user);
        if (data.session) {
          goToHomePage();
        } else {
          setMessage("Please check your email for confirmation");
        }
      }
    } else {
      //Sign in mode is active

      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.toLowerCase(),
        password,
      });

      if (error) {
        return setMessage(error.message);
      } else {
        setUser(data.user);
        goToHomePage();
      }
    }
    // setLoading(false);
  };

  return (
    <main className="w-screen h-screen bg-black flex justify-center items-center">
      <div className=" flex flex-col justify-center items-center bg-white w-[50%] h-[80%] rounded-2xl overflow-hidden">
        <h1 className="heading-primary flex justify-center text-center items-center w-full h-full bg-amber-700">
          {headerMessage}
        </h1>
        {<h2>{message !== "" ? message : ""}</h2>}
        <div className="flex justify-center items-center w-full h-full bg-white">
          <form className="flex gap-6 items-center justify-center flex-col w-[60%] h-full bg-amber-600">
            <div className="flex gap-3 items-center w-[90%]">
              <label htmlFor="email" className="text-black text-[0.8rem]">
                Email
              </label>
              <input
                type="text"
                placeholder="Email Address"
                className="border-2 border-black w-full"
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>

            <div className="flex gap-3 w-[90%]">
              <label htmlFor="password" className="text-black text-[0.8rem]">
                Password
              </label>
              <input
                type="text"
                placeholder="Password"
                onChange={(p) => setPassword(p.target.value)}
                className="border-2 border-black w-full"
              />
            </div>

            {mode === "create-account" ? (
              <div className="flex gap-3 w-[90%]">
                <label htmlFor="password" className="text-black text-[0.8rem]">
                  Confirm Password
                </label>
                <input
                  type="text"
                  placeholder="Confirm Password"
                  onChange={(p) => setConfirmedPassword(p.target.value)}
                  className="border-2 border-black w-full"
                />
              </div>
            ) : (
              ""
            )}
            <div className="bg-black w-[60%] flex gap-3 items-center justify-center">
              <button
                onClick={handleFormSubmission}
                disabled={loading}
                className="text-[0.8rem] rounded-[5%] bg-amber-500 w-[30%] h-8 "
              >
                Create
              </button>
              <button
                onClick={(e: React.MouseEvent<HTMLElement>) => {
                  handleFormSubmission(e, true);
                }}
                disabled={loading}
                className="text-[0.8rem] rounded-[5%] bg-amber-500 w-[30%] h-8 "
              >
                Sign in as guest
              </button>
            </div>
            {mode === "create-account" ? (
              ""
            ) : (
              <div className="flex gap-0.5 flex-col justify-center items-center">
                <a href="" rel="">
                  Forgot password?
                </a>
                <p>or</p>
                <a href="/create-account" rel="">
                  Create an account
                </a>
              </div>
            )}
          </form>
        </div>
        <div className="flex justify-center items-center w-full h-full bg-amber-300"></div>
      </div>
    </main>
  );
};

export default AccountForm;

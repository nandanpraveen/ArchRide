"use client";
import React from "react";
import { useState, useEffect } from "react";
import { ReactFormState } from "react-dom/client";
import { createClient } from "@/lib/supabase/client";
import { User } from "@supabase/supabase-js";
import { useRouter } from "next/navigation";
interface FormProps {
  formMode: "create-account" | "sign-in";
}
const AccountForm = ({ formMode }: FormProps) => {
  //Variable Setup
  const router = useRouter();
  const [loading, setLoading] = useState<boolean>(false);
  const [emailConfirmation, setEmailConfirmation] = useState<boolean>(true); //Currently unused
  const [email, setEmail] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [password, setPassword] = useState<string>("");
  const [confirmedPassword, setConfirmedPassword] = useState<string>("");
  const [user, setUser] = useState<User | null>(null);
  const [mode, setMode] = useState<string>(formMode);
  const [headerMessage, SetHeaderMessage] = useState<string>(
    formMode === "create-account"
      ? "Just one more step, and you'll be on your way!"
      : "Let's get you signed in",
  );

  const handleAccountCreation = async (e: React.MouseEvent<HTMLElement>) => {
    e.preventDefault();
    if (mode === "create-account") {
      if (confirmedPassword === password) {
        processForm();
      } else {
        setError("Passwords do not match. Please try again.");
      }
    } else {
      processForm();
    }
  };

  const processForm = async () => {
    const supabase = createClient();
    setError("");
    setLoading(true);
    if (mode === "create-account") {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
      });

      if (error) {
        return setError(error.message);
      } else {
        setUser(data.user);

        if (data.session) {
          router.push("/");
          router.refresh();
        }
      }
    } else {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        return setError(error.message);
      } else {
        setUser(data.user);
        if (data.session) {
          router.push("/");
          router.refresh();
        }
      }
    }
    setLoading(false);
  };

  return (
    <main className="w-screen h-screen bg-black flex justify-center items-center">
      <div className=" flex flex-col justify-center items-center bg-white w-[50%] h-[80%] rounded-2xl overflow-hidden">
        <h1 className="heading-primary flex justify-center text-center items-center w-full h-full bg-amber-700">
          {headerMessage}
        </h1>
        {<h2>{error !== "" ? error : ""}</h2>}
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
                onClick={handleAccountCreation}
                disabled={loading}
                className="text-[0.8rem] rounded-[5%] bg-amber-500 w-[30%] h-8 "
              >
                Create
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

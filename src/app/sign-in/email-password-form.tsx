"use client";
import React from "react";
import { useState, useEffect } from "react";
import { ReactFormState } from "react-dom/client";
import { createClient } from "@/lib/supabase/client";
import { User } from "@supabase/supabase-js";

const EmailPassword = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [user, setUser] = useState<User | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {});

  const handleLogin = async (e: React.MouseEvent<HTMLElement>) => {
    e.preventDefault();
    const supabase = createClient();
    setError("");
    setLoading(true);
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    setLoading(false);

    if (error) {
      return setError(error.message);
    } else {
      setUser(data.user);
    }
  };

  return (
    <main className="w-screen h-screen bg-black flex justify-center items-center">
      <div className=" flex flex-col justify-center items-center bg-white w-[50%] h-[80%] rounded-2xl overflow-hidden">
        <h1 className="heading-primary text-center flex justify-center items-center w-full h-full bg-amber-700">
          Let's get you signed in!
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
            <div className="bg-black w-[60%] flex gap-3 items-center justify-center">
              <button
                onClick={handleLogin}
                disabled={loading}
                className="text-[0.8rem] rounded-[5%] bg-amber-500 w-[30%] h-8 "
              >
                Log In
              </button>
            </div>

            <div className="flex gap-0.5 flex-col justify-center items-center">
              <a href="" rel="">
                Forgot password?
              </a>
              <p>or</p>
              <a href="/create-account" rel="">
                Create an account
              </a>
            </div>
          </form>
        </div>
        <div className="flex justify-center items-center w-full h-full bg-amber-300"></div>
      </div>
    </main>
  );
};

export default EmailPassword;

import React from "react";

const page = () => {
  return (
    <main className="w-screen h-screen bg-black flex justify-center items-center">
      <div className=" flex flex-col bg-white w-[50%] h-[80%] rounded-2xl overflow-hidden">
        <h1 className="heading-primary flex justify-center items-center w-full h-full bg-amber-700">
          Let's get you signed in!
        </h1>
        <div className="flex justify-center items-center w-full h-full bg-white">
          <form className="flex gap-6 items-center justify-center flex-col w-[60%] h-full bg-amber-600">
            <div className="flex gap-3 items-center w-[90%]">
              <label htmlFor="username" className="text-black text-[0.8rem]">
                Username
              </label>
              <input
                type="text"
                placeholder="Username"
                className="border-2 border-black w-full"
              />
            </div>

            <div className="flex gap-3 w-[90%]">
              <label htmlFor="password" className="text-black text-[0.8rem]">
                Password
              </label>
              <input
                type="text"
                placeholder="Password"
                className="border-2 border-black w-full"
              />
            </div>
            <div className="bg-black w-[60%] flex gap-3 items-center justify-center">
              <button className="text-[0.8rem] rounded-[5%] bg-amber-500 w-[30%] h-8 ">
                Log In
              </button>
            </div>

            <a href="" rel="">
              Forgot password?
            </a>
          </form>
        </div>
        <div className="flex justify-center items-center w-full h-full bg-amber-300"></div>
      </div>
    </main>
  );
};

export default page;

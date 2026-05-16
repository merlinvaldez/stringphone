import { SignIn, SignedIn, SignedOut } from "@clerk/clerk-react";
import { Navigate } from "react-router-dom";

export default function Login() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-zinc-950 px-6 py-10 text-zinc-100">
      <SignedIn>
        <Navigate to="/" replace />
      </SignedIn>
      <SignedOut>
        <SignIn
          routing="path"
          path="/login"
          signUpUrl="/signup"
          fallbackRedirectUrl="/"
        />
      </SignedOut>
    </main>
  );
}

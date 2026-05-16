import { createContext, useContext } from "react";
import { useAuth, useClerk } from "@clerk/clerk-react";

const AuthContext = createContext(undefined);

export function AuthProvider({ children }) {
  const { isLoaded, isSignedIn, getToken } = useAuth();
  const { signOut } = useClerk();

  const authFetch = async (url, options = {}) => {
    const token = await getToken();
    const headers = new Headers(options.headers ?? {});

    if (token) {
      headers.set("Authorization", `Bearer ${token}`);
    }

    return fetch(url, { ...options, headers });
  };

  const refreshAccount = async () => null;

  return (
    <AuthContext.Provider
      value={{
        isLoaded,
        isSignedIn: Boolean(isSignedIn),
        account: null,
        authFetch,
        refreshAccount,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAppAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAppAuth must be used within AuthProvider");
  }

  return context;
}

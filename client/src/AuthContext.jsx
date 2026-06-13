import {
  createContext,
  useContext,
  useEffect,
  useEffectEvent,
  useRef,
  useState,
} from "react";
import { useAuth, useClerk } from "@clerk/clerk-react";

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, "") ?? "/api";
const AuthContext = createContext(undefined);

async function parseJsonBody(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function getErrorMessage(body, fallback) {
  return typeof body?.error === "string" ? body.error : fallback;
}

export function AuthProvider({ children }) {
  const { isLoaded, isSignedIn, getToken } = useAuth();
  const { signOut: clerkSignOut } = useClerk();
  const [account, setAccount] = useState(null);
  const [isResolvingAccount, setIsResolvingAccount] = useState(false);
  const refreshAccountPromiseRef = useRef(null);

  const authFetch = async (url, options = {}) => {
    const token = await getToken();
    const headers = new Headers(options.headers ?? {});

    if (token) {
      headers.set("Authorization", `Bearer ${token}`);
    }

    return fetch(url, { ...options, headers });
  };

  const refreshAccount = useEffectEvent(async () => {
    if (!isSignedIn) {
      setAccount(null);
      return null;
    }

    if (refreshAccountPromiseRef.current) {
      return refreshAccountPromiseRef.current;
    }

    const refreshRequest = (async () => {
      setIsResolvingAccount(true);

      try {
        const currentUserResponse = await authFetch(`${API_BASE_URL}/users/me`, {
          cache: "no-store",
        });

        if (currentUserResponse.ok) {
          const currentUser = await currentUserResponse.json();
          setAccount(currentUser);
          return currentUser;
        }

        const currentUserErrorBody = await parseJsonBody(currentUserResponse);

        if (currentUserResponse.status !== 404) {
          throw new Error(
            getErrorMessage(
              currentUserErrorBody,
              "Failed to load current user",
            ),
          );
        }

        const bootstrapResponse = await authFetch(
          `${API_BASE_URL}/users/me/bootstrap`,
          {
            method: "POST",
          },
        );
        const bootstrapBody = await parseJsonBody(bootstrapResponse);

        if (!bootstrapResponse.ok) {
          throw new Error(
            getErrorMessage(bootstrapBody, "Failed to bootstrap current user"),
          );
        }

        setAccount(bootstrapBody);
        return bootstrapBody;
      } finally {
        setIsResolvingAccount(false);
      }
    })();

    refreshAccountPromiseRef.current = refreshRequest;

    try {
      return await refreshRequest;
    } finally {
      if (refreshAccountPromiseRef.current === refreshRequest) {
        refreshAccountPromiseRef.current = null;
      }
    }
  });

  useEffect(() => {
    if (!isLoaded) {
      return;
    }

    if (!isSignedIn) {
      refreshAccountPromiseRef.current = null;
      setIsResolvingAccount(false);
      setAccount(null);
      return;
    }

    refreshAccount().catch((error) => {
      console.error("Failed to refresh current app user", error);
    });
  }, [isLoaded, isSignedIn]);

  const signOut = async (...args) => {
    refreshAccountPromiseRef.current = null;
    setIsResolvingAccount(false);
    setAccount(null);
    return clerkSignOut(...args);
  };

  return (
    <AuthContext.Provider
      value={{
        isLoaded: Boolean(isLoaded) && (!isSignedIn || !isResolvingAccount),
        isSignedIn: Boolean(isSignedIn),
        account,
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

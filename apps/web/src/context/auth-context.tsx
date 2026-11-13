"use client";

import * as React from "react";
import { UserDTO, UserProfileResponse } from "@clipforge/shared-types";
import { fetchApi, setMemoryAccessToken, ApiError } from "@/lib/api-client";

interface AuthContextValue {
  user: UserDTO | null;
  subscription: UserProfileResponse["subscription"] | null;
  credits: UserProfileResponse["credits"] | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, fullName: string) => Promise<{ devVerificationToken?: string }>;
  logout: () => Promise<void>;
  refreshSession: () => Promise<boolean>;
  fetchProfile: () => Promise<void>;
}

const AuthContext = React.createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = React.useState<UserDTO | null>(null);
  const [subscription, setSubscription] = React.useState<UserProfileResponse["subscription"] | null>(null);
  const [credits, setCredits] = React.useState<UserProfileResponse["credits"] | null>(null);
  const [isLoading, setIsLoading] = React.useState<boolean>(true);

  const fetchProfile = React.useCallback(async () => {
    try {
      const data = await fetchApi<UserProfileResponse>("/api/v1/auth/me");
      setUser(data.user);
      setSubscription(data.subscription);
      setCredits(data.credits);
    } catch (err) {
      if (err instanceof ApiError && err.statusCode === 401) {
        setUser(null);
        setSubscription(null);
        setCredits(null);
      }
    }
  }, []);

  const refreshSession = React.useCallback(async (): Promise<boolean> => {
    try {
      const data = await fetchApi<{ accessToken: string; user: UserDTO }>("/api/v1/auth/refresh", {
        method: "POST",
      });
      if (data.accessToken) {
        setMemoryAccessToken(data.accessToken);
        setUser(data.user);
        await fetchProfile();
        return true;
      }
      return false;
    } catch {
      setMemoryAccessToken(null);
      setUser(null);
      setSubscription(null);
      setCredits(null);
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [fetchProfile]);

  React.useEffect(() => {
    refreshSession();
  }, [refreshSession]);

  const login = async (email: string, password: string): Promise<void> => {
    const data = await fetchApi<{ user: UserDTO; accessToken: string }>("/api/v1/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });

    setMemoryAccessToken(data.accessToken);
    setUser(data.user);
    await fetchProfile();
  };

  const register = async (
    email: string,
    password: string,
    fullName: string,
  ): Promise<{ devVerificationToken?: string }> => {
    const data = await fetchApi<{
      user: UserDTO;
      accessToken: string;
      devVerificationToken?: string;
    }>("/api/v1/auth/register", {
      method: "POST",
      body: JSON.stringify({ email, password, fullName }),
    });

    setMemoryAccessToken(data.accessToken);
    setUser(data.user);
    await fetchProfile();

    return { devVerificationToken: data.devVerificationToken };
  };

  const logout = async (): Promise<void> => {
    try {
      await fetchApi<{ loggedOut: boolean }>("/api/v1/auth/logout", {
        method: "POST",
      });
    } catch {
      // Ignore logout network errors
    } finally {
      setMemoryAccessToken(null);
      setUser(null);
      setSubscription(null);
      setCredits(null);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        subscription,
        credits,
        isLoading,
        login,
        register,
        logout,
        refreshSession,
        fetchProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const context = React.useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}

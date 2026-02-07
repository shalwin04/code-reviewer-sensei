"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
  ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import apiClient, { User, Repository, ApiError } from "./api";

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  repositories: Repository[];
  selectedRepo: string | null;
  login: () => void;
  logout: () => Promise<void>;
  refreshUser: () => Promise<User | null>;
  refreshRepositories: () => Promise<void>;
  setSelectedRepo: (repo: string | null) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [repositories, setRepositories] = useState<Repository[]>([]);
  const [selectedRepo, setSelectedRepoState] = useState<string | null>(null);
  const initializedRef = useRef(false);
  const fetchingReposRef = useRef(false);

  // Custom setter that also updates localStorage
  const setSelectedRepo = useCallback((repo: string | null) => {
    setSelectedRepoState(repo);
    if (repo) {
      localStorage.setItem("selectedRepo", repo);
    } else {
      localStorage.removeItem("selectedRepo");
    }
  }, []);

  const refreshUser = useCallback(async () => {
    // First check localStorage (for cross-domain auth workaround)
    const storedUser = localStorage.getItem("auth_user");
    if (storedUser) {
      try {
        const userData = JSON.parse(storedUser);
        setUser({
          ...userData,
          isAuthenticated: true,
        });
        return { ...userData, isAuthenticated: true };
      } catch (e) {
        console.error("Failed to parse stored user:", e);
        localStorage.removeItem("auth_user");
      }
    }

    // Then try the API (for same-domain or cookie-based auth)
    try {
      const userData = await apiClient.getCurrentUser();
      if (userData.isAuthenticated) {
        setUser(userData);
        return userData;
      } else {
        setUser(null);
        return null;
      }
    } catch (error) {
      console.error("Failed to fetch user:", error);
      setUser(null);
      return null;
    }
  }, []);

  const refreshRepositories = useCallback(async () => {
    if (fetchingReposRef.current) return;
    fetchingReposRef.current = true;

    try {
      const repos = await apiClient.getRepositories();
      setRepositories(repos);

      // Auto-select first repo if none selected and we have repos
      const savedRepo = localStorage.getItem("selectedRepo");
      if (savedRepo && repos.some(r => r.fullName === savedRepo)) {
        setSelectedRepoState(savedRepo);
      } else if (repos.length > 0) {
        const firstRepo = repos[0].fullName;
        setSelectedRepoState(firstRepo);
        localStorage.setItem("selectedRepo", firstRepo);
      }
    } catch (error) {
      console.error("Failed to fetch repositories:", error);
      if (error instanceof ApiError && error.status === 401) {
        setUser(null);
      }
    } finally {
      fetchingReposRef.current = false;
    }
  }, []);

  // Initial auth check - runs once on mount
  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;

    const initAuth = async () => {
      setIsLoading(true);

      // Load saved repo from localStorage first
      const savedRepo = localStorage.getItem("selectedRepo");
      if (savedRepo) {
        setSelectedRepoState(savedRepo);
      }

      const userData = await refreshUser();

      if (userData) {
        await refreshRepositories();
      }

      setIsLoading(false);
    };

    initAuth();
  }, [refreshUser, refreshRepositories]);

  // Listen for storage events (cross-tab auth sync and callback page)
  useEffect(() => {
    const handleStorageChange = async () => {
      const storedUser = localStorage.getItem("auth_user");
      if (storedUser && !user) {
        try {
          const userData = JSON.parse(storedUser);
          setUser({
            ...userData,
            isAuthenticated: true,
          });
          await refreshRepositories();
        } catch (e) {
          console.error("Failed to parse stored user:", e);
        }
      } else if (!storedUser && user) {
        setUser(null);
        setRepositories([]);
      }
    };

    window.addEventListener("storage", handleStorageChange);
    return () => window.removeEventListener("storage", handleStorageChange);
  }, [user, refreshRepositories]);

  const login = useCallback(() => {
    // Redirect to backend OAuth endpoint
    window.location.href = apiClient.getLoginUrl();
  }, []);

  const logout = useCallback(async () => {
    try {
      await apiClient.logout();
    } catch (error) {
      console.error("Failed to logout:", error);
    }
    // Always clear local state
    setUser(null);
    setRepositories([]);
    setSelectedRepoState(null);
    localStorage.removeItem("selectedRepo");
    localStorage.removeItem("auth_user");
    router.push("/");
  }, [router]);

  const value: AuthContextType = {
    user,
    isLoading,
    isAuthenticated: !!user,
    repositories,
    selectedRepo,
    login,
    logout,
    refreshUser,
    refreshRepositories,
    setSelectedRepo,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}

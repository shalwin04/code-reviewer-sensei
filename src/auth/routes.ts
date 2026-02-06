import { Router, Request, Response, NextFunction } from "express";
import passport from "passport";
import {
  SessionUser,
  getUserRepositories,
  getUserOrganizations,
  getOrgRepositories,
  verifyRepoAccess,
} from "./index.js";

const router = Router();

// Extend Express Request to include user
declare global {
  namespace Express {
    interface User extends SessionUser {}
  }
}

// ============================================
// Auth Middleware
// ============================================

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (req.isAuthenticated() && req.user) {
    return next();
  }
  res.status(401).json({ error: "Unauthorized", message: "Please log in to continue" });
}

export function optionalAuth(_req: Request, _res: Response, next: NextFunction) {
  // Just continue, user may or may not be authenticated
  next();
}

// ============================================
// Auth Routes
// ============================================

// Get current user
router.get("/me", (req: Request, res: Response) => {
  if (req.isAuthenticated() && req.user) {
    const user = req.user;
    res.json({
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      email: user.email,
      avatarUrl: user.avatarUrl,
      isAuthenticated: true,
    });
  } else {
    res.json({ isAuthenticated: false });
  }
});

// GitHub OAuth - Initiate
router.get(
  "/github",
  passport.authenticate("github", {
    scope: ["user:email", "repo", "read:org"],
  })
);

// GitHub OAuth - Callback
router.get(
  "/github/callback",
  passport.authenticate("github", {
    failureRedirect: "/auth/failure",
  }),
  (_req: Request, res: Response) => {
    // Successful authentication, redirect to frontend
    const frontendUrl = process.env.FRONTEND_URL || "http://localhost:3001";
    res.redirect(`${frontendUrl}/dashboard?auth=success`);
  }
);

// Auth failure
router.get("/failure", (_req: Request, res: Response) => {
  const frontendUrl = process.env.FRONTEND_URL || "http://localhost:3001";
  res.redirect(`${frontendUrl}?auth=failure`);
});

// Logout
router.post("/logout", (req: Request, res: Response) => {
  req.logout((err) => {
    if (err) {
      res.status(500).json({ error: "Failed to logout" });
      return;
    }
    req.session.destroy((err) => {
      if (err) {
        res.status(500).json({ error: "Failed to destroy session" });
        return;
      }
      res.clearCookie("connect.sid");
      res.json({ success: true, message: "Logged out successfully" });
    });
  });
});

// ============================================
// Repository Routes (Protected)
// ============================================

// Get user's repositories
router.get("/repositories", requireAuth, async (req: Request, res: Response) => {
  try {
    const user = req.user!;
    const repos = await getUserRepositories(user.accessToken);
    res.json(repos);
  } catch (error) {
    console.error("Failed to fetch repositories:", error);
    res.status(500).json({ error: "Failed to fetch repositories" });
  }
});

// Get user's organizations
router.get("/organizations", requireAuth, async (req: Request, res: Response) => {
  try {
    const user = req.user!;
    const orgs = await getUserOrganizations(user.accessToken);
    res.json(orgs);
  } catch (error) {
    console.error("Failed to fetch organizations:", error);
    res.status(500).json({ error: "Failed to fetch organizations" });
  }
});

// Get organization repositories
router.get("/organizations/:org/repositories", requireAuth, async (req: Request, res: Response) => {
  try {
    const user = req.user!;
    const org = req.params.org as string;
    const repos = await getOrgRepositories(user.accessToken, org);
    res.json(repos);
  } catch (error) {
    console.error(`Failed to fetch repositories for org ${req.params.org}:`, error);
    res.status(500).json({ error: "Failed to fetch organization repositories" });
  }
});

// Verify repository access
router.get("/repositories/:owner/:repo/verify", requireAuth, async (req: Request, res: Response) => {
  try {
    const user = req.user!;
    const owner = req.params.owner as string;
    const repo = req.params.repo as string;
    const hasAccess = await verifyRepoAccess(user.accessToken, owner, repo);
    res.json({ hasAccess });
  } catch (error) {
    console.error("Failed to verify repository access:", error);
    res.status(500).json({ error: "Failed to verify repository access" });
  }
});

export { router as authRouter };

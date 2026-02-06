import passport from "passport";
import { Strategy as GitHubStrategy, Profile } from "passport-github2";
import { Octokit } from "@octokit/rest";

// User interface
export interface User {
  id: string;
  githubId: string;
  username: string;
  displayName: string;
  email: string | null;
  avatarUrl: string;
  accessToken: string;
}

// Session user (minimal data stored in session)
export interface SessionUser {
  id: string;
  githubId: string;
  username: string;
  displayName: string;
  email: string | null;
  avatarUrl: string;
  accessToken: string;
}

// In-memory user store (for production, use a database)
const users = new Map<string, User>();

// Get OAuth config from environment
function getOAuthConfig() {
  const clientId = process.env.GITHUB_CLIENT_ID;
  const clientSecret = process.env.GITHUB_CLIENT_SECRET;
  const callbackURL = process.env.GITHUB_CALLBACK_URL || "http://localhost:3000/auth/github/callback";

  if (!clientId || !clientSecret) {
    console.warn("⚠️  GitHub OAuth not configured. Set GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET");
    return null;
  }

  return { clientId, clientSecret, callbackURL };
}

// Initialize passport with GitHub strategy
export function initializePassport() {
  const oauthConfig = getOAuthConfig();

  if (!oauthConfig) {
    return false;
  }

  passport.use(
    new GitHubStrategy(
      {
        clientID: oauthConfig.clientId,
        clientSecret: oauthConfig.clientSecret,
        callbackURL: oauthConfig.callbackURL,
        scope: ["user:email", "repo", "read:org"],
      },
      async (
        accessToken: string,
        _refreshToken: string,
        profile: Profile,
        done: (error: Error | null, user?: User) => void
      ) => {
        try {
          // Create or update user
          const user: User = {
            id: profile.id,
            githubId: profile.id,
            username: profile.username || "",
            displayName: profile.displayName || profile.username || "",
            email: profile.emails?.[0]?.value || null,
            avatarUrl: profile.photos?.[0]?.value || "",
            accessToken,
          };

          users.set(user.id, user);
          done(null, user);
        } catch (error) {
          done(error as Error);
        }
      }
    )
  );

  // Serialize user to session
  passport.serializeUser((user: Express.User, done) => {
    const sessionUser = user as SessionUser;
    done(null, {
      id: sessionUser.id,
      githubId: sessionUser.githubId,
      username: sessionUser.username,
      displayName: sessionUser.displayName,
      email: sessionUser.email,
      avatarUrl: sessionUser.avatarUrl,
      accessToken: sessionUser.accessToken,
    });
  });

  // Deserialize user from session
  passport.deserializeUser((sessionUser: SessionUser, done) => {
    // Return the session user directly (it contains all we need)
    done(null, sessionUser as User);
  });

  return true;
}

// Get user's repositories from GitHub
export async function getUserRepositories(accessToken: string) {
  const octokit = new Octokit({ auth: accessToken });

  try {
    const { data: repos } = await octokit.repos.listForAuthenticatedUser({
      sort: "updated",
      per_page: 100,
      visibility: "all",
    });

    return repos.map((repo) => ({
      id: repo.id,
      name: repo.name,
      fullName: repo.full_name,
      description: repo.description,
      private: repo.private,
      url: repo.html_url,
      language: repo.language,
      updatedAt: repo.updated_at,
      defaultBranch: repo.default_branch,
      owner: {
        login: repo.owner.login,
        avatarUrl: repo.owner.avatar_url,
      },
    }));
  } catch (error) {
    console.error("Failed to fetch repositories:", error);
    throw error;
  }
}

// Get user's organizations from GitHub
export async function getUserOrganizations(accessToken: string) {
  const octokit = new Octokit({ auth: accessToken });

  try {
    const { data: orgs } = await octokit.orgs.listForAuthenticatedUser();

    return orgs.map((org) => ({
      id: org.id,
      login: org.login,
      description: org.description,
      avatarUrl: org.avatar_url,
    }));
  } catch (error) {
    console.error("Failed to fetch organizations:", error);
    throw error;
  }
}

// Get organization repositories
export async function getOrgRepositories(accessToken: string, org: string) {
  const octokit = new Octokit({ auth: accessToken });

  try {
    const { data: repos } = await octokit.repos.listForOrg({
      org,
      sort: "updated",
      per_page: 100,
    });

    return repos.map((repo) => ({
      id: repo.id,
      name: repo.name,
      fullName: repo.full_name,
      description: repo.description,
      private: repo.private,
      url: repo.html_url,
      language: repo.language,
      updatedAt: repo.updated_at,
      defaultBranch: repo.default_branch,
      owner: {
        login: repo.owner.login,
        avatarUrl: repo.owner.avatar_url,
      },
    }));
  } catch (error) {
    console.error(`Failed to fetch repositories for org ${org}:`, error);
    throw error;
  }
}

// Verify user has access to a repository
export async function verifyRepoAccess(accessToken: string, owner: string, repo: string) {
  const octokit = new Octokit({ auth: accessToken });

  try {
    await octokit.repos.get({ owner, repo });
    return true;
  } catch (error) {
    return false;
  }
}

export { passport };

import NextAuth from "next-auth";
import GoogleProvider from "next-auth/providers/google";

const BACKEND_URL =
  (typeof process !== "undefined" && process.env.NEXT_PUBLIC_API_URL) ||
  "http://localhost:5000";
const ACCESS_TOKEN_LIFETIME_MS = 14 * 60 * 1000; // 14 min (refresh 1 min before 15-min expiry)

async function refreshBackendToken(refreshToken: string) {
  const res = await fetch(`${BACKEND_URL}/api/auth/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refreshToken }),
  });
  if (!res.ok) return null;
  const data = await res.json();
  // Backend returns { success: true, data: { accessToken, refreshToken } }
  return data?.data && typeof data.data.accessToken === "string" ? data.data : null;
}

const handler = NextAuth({
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID || "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
      authorization: { params: { prompt: "consent" } },
    }),
  ],
  callbacks: {
    async signIn({ user, account }) {
      try {
        const response = await fetch(`${BACKEND_URL}/api/auth/signin`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            googleId: account?.providerAccountId,
            email: user.email,
            name: user.name,
            image: user.image,
            role: "admin",
          }),
        });
        const data = await response.json();
        if (!response.ok) {
          const message = (data && typeof data.message === "string") ? data.message : `Signin failed with status ${response.status}`;
          throw new Error(message);
        }
        // Backend returns { success: true, data: { user, accessToken, refreshToken } }
        const payload = data?.data;
        if (!payload?.user) {
          throw new Error("Invalid sign-in response");
        }
        user.id = payload.user.id;
        (user as any).accessToken = payload.accessToken;
        (user as any).refreshToken = payload.refreshToken;
        (user as any).role = payload.user.role;
        return true;
      } catch (error) {
        console.error("[NEXTAUTH] Sign in error:", error);
        throw error;
      }
    },
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.accessToken = (user as any).accessToken;
        token.refreshToken = (user as any).refreshToken;
        token.role = (user as any).role;
        token.accessTokenExpires = Date.now() + ACCESS_TOKEN_LIFETIME_MS;
        token.error = undefined;
        return token;
      }
      if (Date.now() < (token.accessTokenExpires as number)) return token;
      const refreshed = await refreshBackendToken(token.refreshToken as string);
      if (refreshed) {
        token.accessToken = refreshed.accessToken;
        token.refreshToken = refreshed.refreshToken;
        token.accessTokenExpires = Date.now() + ACCESS_TOKEN_LIFETIME_MS;
        token.error = undefined;
      } else {
        token.error = "RefreshTokenExpired";
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as any).id = token.id;
        (session.user as any).accessToken = token.accessToken;
        (session.user as any).refreshToken = token.refreshToken;
        (session.user as any).role = token.role;
        (session.user as any).error = token.error;
      }
      return session;
    },
  },
  pages: { signIn: "/auth/login", error: "/auth/login" },
  session: { strategy: "jwt", maxAge: 7 * 24 * 60 * 60 },
  secret: process.env.NEXTAUTH_SECRET,
});

export { handler as GET, handler as POST };

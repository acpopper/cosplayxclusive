import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Nav } from "@/components/nav";
import { Footer } from "@/components/footer";
import { Badge } from "@/components/ui/badge";
import { AccountForm } from "./account-form";
import { BlockedList, type BlockedUser } from "./blocked-list";
import type { Profile } from "@/lib/types";

export const metadata = { title: "Settings — CosplayXclusive" };

export default async function SettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/settings");

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  if (!profile) redirect("/login");

  const cs = profile.creator_status as Profile["creator_status"];

  // Blocked users (self blocks)
  const { data: blocks } = await supabase
    .from("user_blocks")
    .select("blocked_id, created_at")
    .eq("blocker_id", user.id)
    .order("created_at", { ascending: false });

  const blockedIds = (blocks ?? []).map((b) => b.blocked_id as string);
  let blockedUsers: BlockedUser[] = [];
  if (blockedIds.length > 0) {
    const { data: profs } = await supabase
      .from("profiles")
      .select("id, username, display_name, avatar_url")
      .in("id", blockedIds);

    const profMap = new Map((profs ?? []).map((p) => [p.id, p]));
    blockedUsers = (blocks ?? [])
      .map((b) => {
        const p = profMap.get(b.blocked_id as string);
        return p
          ? {
              id: p.id,
              username: p.username,
              display_name: p.display_name,
              avatar_url: p.avatar_url,
              created_at: b.created_at as string,
            }
          : null;
      })
      .filter((x): x is BlockedUser => x !== null);
  }

  const statusBadge =
    cs === "approved" ? (
      <Badge variant="success">Approved</Badge>
    ) : cs === "pending" ? (
      <Badge variant="warning">Under review</Badge>
    ) : cs === "rejected" ? (
      <Badge variant="error">Rejected</Badge>
    ) : cs === "suspended" ? (
      <Badge variant="warning">Suspended</Badge>
    ) : null;

  return (
    <div className="min-h-screen bg-bg-base flex flex-col">
      <Nav profile={profile as Profile} />

      <main className="mx-auto max-w-2xl w-full px-4 py-10 flex-1">
        <h1 className="text-2xl font-bold text-text-primary mb-1">Settings</h1>
        <p className="text-sm text-text-muted mb-8">
          Manage your account and creator status
        </p>

        <div className="flex flex-col gap-5">
          {/* Profile section */}
          <section className="bg-bg-card border border-border rounded-2xl p-5">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="h-12 w-12 rounded-full overflow-hidden bg-bg-elevated flex-shrink-0">
                  {profile.avatar_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={profile.avatar_url}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="h-full w-full flex items-center justify-center bg-gradient-to-br from-accent to-accent-alt">
                      <span className="text-lg font-bold text-white">
                        {(profile.display_name ||
                          profile.username)[0].toUpperCase()}
                      </span>
                    </div>
                  )}
                </div>
                <div>
                  <p className="font-semibold text-text-primary">
                    {profile.display_name || profile.username}
                  </p>
                  <p className="text-sm text-text-muted">@{profile.username}</p>
                  <p className="text-xs text-text-muted mt-0.5">{user.email}</p>
                </div>
              </div>
              {cs && (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-text-muted hidden sm:block">
                    Creator
                  </span>
                  {statusBadge}
                </div>
              )}
            </div>
          </section>

          {/* Creator status section */}
          <section className="bg-bg-card border border-border rounded-2xl p-5">
            <h2 className="text-sm font-semibold text-text-primary mb-1">
              Creator Programme
            </h2>

            {cs === null && (
              <>
                <p className="text-sm text-text-secondary mb-4">
                  Share your cosplay content, set up subscriptions, and earn
                  directly from your fans — a platform built exclusively for
                  cosplayers.
                </p>
                <ul className="text-sm text-text-muted space-y-1.5 mb-5">
                  {[
                    "Post exclusive photo & video content",
                    "Set your own monthly subscription price",
                    "Offer pay-per-view posts",
                    "Receive tips from fans",
                    "Keep ~80% of all earnings",
                  ].map((item) => (
                    <li key={item} className="flex items-center gap-2">
                      <span className="text-accent text-xs">✓</span>
                      {item}
                    </li>
                  ))}
                </ul>
                <Link
                  href="/settings/creator-apply"
                  className="inline-flex items-center gap-2 h-10 px-5 rounded-xl font-semibold bg-accent text-white hover:bg-accent-hover transition-colors text-sm"
                >
                  Apply to become a creator →
                </Link>
              </>
            )}

            {cs === "pending" && (
              <div className="flex flex-col gap-3">
                <div className="flex items-center gap-3 p-3 bg-warning/5 border border-warning/20 rounded-xl">
                  <span className="text-xl">⏳</span>
                  <div>
                    <p className="text-sm font-medium text-text-primary">
                      Your application is under review
                    </p>
                    <p className="text-xs text-text-muted mt-0.5">
                      Our team is reviewing your application. We&apos;ll notify
                      you via messages when a decision is made — usually within
                      a few business days.
                    </p>
                  </div>
                </div>
                {profile.creator_applied_at && (
                  <p className="text-xs text-text-muted">
                    Applied on{" "}
                    {new Date(profile.creator_applied_at).toLocaleDateString(
                      "en-US",
                      { month: "long", day: "numeric", year: "numeric" },
                    )}
                  </p>
                )}
              </div>
            )}

            {cs === "approved" && (
              <div className="flex flex-col gap-3">
                <div className="flex items-center gap-3 p-3 bg-success/5 border border-success/20 rounded-xl">
                  <span className="text-xl">✦</span>
                  <div>
                    <p className="text-sm font-medium text-text-primary">
                      You&apos;re an approved creator!
                    </p>
                    <p className="text-xs text-text-muted mt-0.5">
                      Your creator profile is live. Manage your content,
                      subscribers, and earnings from your dashboard.
                    </p>
                  </div>
                </div>
                <div className="flex gap-2 flex-wrap">
                  <Link
                    href="/dashboard"
                    className="inline-flex items-center gap-1.5 h-9 px-4 rounded-lg font-medium bg-accent text-white hover:bg-accent-hover transition-colors text-sm"
                  >
                    Go to Dashboard
                  </Link>
                  <Link
                    href={`/${profile.username}`}
                    className="inline-flex items-center gap-1.5 h-9 px-4 rounded-lg font-medium border border-border bg-bg-elevated text-text-secondary hover:text-text-primary transition-colors text-sm"
                    target="_blank"
                  >
                    View public profile ↗
                  </Link>
                </div>
              </div>
            )}

            {cs === "rejected" && (
              <div className="flex flex-col gap-3">
                <div className="flex items-center gap-3 p-3 bg-error/5 border border-error/20 rounded-xl">
                  <span className="text-xl">✕</span>
                  <div>
                    <p className="text-sm font-medium text-text-primary">
                      Application not approved
                    </p>
                    <p className="text-xs text-text-muted mt-0.5">
                      Your application wasn&apos;t approved at this time. Check
                      your messages for feedback from our team. You&apos;re
                      welcome to apply again once you&apos;ve addressed the
                      feedback.
                    </p>
                  </div>
                </div>
                <Link
                  href="/settings/creator-apply"
                  className="inline-flex items-center gap-2 h-9 px-4 rounded-lg font-medium border border-border bg-bg-elevated text-text-secondary hover:text-text-primary transition-colors text-sm"
                >
                  Reapply
                </Link>
              </div>
            )}

            {cs === "suspended" && (
              <div className="flex items-center gap-3 p-3 bg-warning/5 border border-warning/20 rounded-xl">
                <span className="text-xl">⚠</span>
                <div>
                  <p className="text-sm font-medium text-text-primary">
                    Creator account suspended
                  </p>
                  <p className="text-xs text-text-muted mt-0.5">
                    Your creator account has been suspended. Please check your
                    messages for details or contact{" "}
                    <a
                      href="mailto:support@cosplayxclusive.com"
                      className="text-accent hover:underline"
                    >
                      support
                    </a>
                    .
                  </p>
                </div>
              </div>
            )}
          </section>

          {/* Account actions */}
          <section className="bg-bg-card border border-border rounded-2xl p-5">
            <h2 className="text-sm font-semibold text-text-primary mb-1">
              Account
            </h2>
            <p className="text-xs text-text-muted mb-4">
              Member since{" "}
              {new Date(profile.created_at).toLocaleDateString("en-US", {
                month: "long",
                year: "numeric",
              })}
            </p>
            <AccountForm
              currentUsername={profile.username}
              currentEmail={user.email ?? ""}
            />
          </section>

          {/* Blocked accounts */}
          <section className="bg-bg-card border border-border rounded-2xl p-5">
            <h2 className="text-sm font-semibold text-text-primary mb-1">
              Blocked accounts
            </h2>
            <p className="text-xs text-text-muted mb-4">
              Blocked users can&apos;t message you, and you won&apos;t see their
              posts or profile.
            </p>
            <BlockedList initial={blockedUsers} />
          </section>
        </div>
      </main>

      <Footer />
    </div>
  );
}

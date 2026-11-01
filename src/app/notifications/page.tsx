"use client";
import Link from "next/link";
import { Alert, Button, Chip, List, ListItem, ListItemText, Paper, Stack, Typography } from "@mui/material";
import { EmptyState } from "@/components/empty-state";
import { useNotificationCenter } from "@/components/notifications-provider";

const timeFormat = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  hour: "numeric",
  minute: "2-digit",
});

export default function NotificationsPage() {
  const { notifications, unreadCount, status, source, saveError, markRead, markAllRead, clear, reload } =
    useNotificationCenter();
  return (
    <Stack spacing={3} sx={{ maxWidth: 720 }}>
      <Typography component="h1" variant="h1">
        Notifications
      </Typography>
      <Typography color="text.secondary" sx={{ maxWidth: "65ch" }}>
        Leave-now reminders appear here while ArchRide is open in your browser. They are not sent as texts, emails or
        phone notifications.
      </Typography>
      {status === "ready" && source === "device" && (
        <Alert severity="info">
          You are browsing as a guest, so notifications are kept on this device only.{" "}
          <Link href="/sign-in">Sign in</Link> to keep them with your account.
        </Alert>
      )}
      {saveError && <Alert severity="error">{saveError}</Alert>}
      {status === "loading" && <Typography role="status">Loading notifications…</Typography>}
      {status === "error" && (
        <Alert severity="error" action={<Button color="inherit" size="small" onClick={reload}>Retry</Button>}>
          Your notifications could not be loaded. Check your connection and try again.
        </Alert>
      )}
      {status === "ready" && !notifications.length && (
        <EmptyState
          title="No notifications"
          description="When a bus you are watching is close, a leave-now reminder shows up here."
          action="Go to Home"
          href="/"
        />
      )}
      {status === "ready" && notifications.length > 0 && (
        <>
          <Stack direction="row" spacing={2} sx={{ alignItems: "center" }}>
            <Typography role="status" color="text.secondary">
              {unreadCount ? `${unreadCount} unread` : "All read"}
            </Typography>
            <Button disabled={!unreadCount} onClick={() => void markAllRead()}>
              Mark all read
            </Button>
          </Stack>
          <Paper variant="outlined" component="section" aria-label="Notification list">
            <List disablePadding>
              {notifications.map((item) => (
                <ListItem
                  key={item.id}
                  divider
                  sx={{ alignItems: "flex-start", gap: 1, flexWrap: "wrap" }}
                  secondaryAction={undefined}
                >
                  <ListItemText
                    sx={{ minWidth: 220, flex: 1 }}
                    primary={
                      <Stack direction="row" spacing={1} sx={{ alignItems: "center", flexWrap: "wrap" }}>
                        <Typography component="span" sx={{ fontWeight: item.readAt ? 400 : 700 }}>
                          {item.title}
                        </Typography>
                        {!item.readAt && <Chip size="small" color="primary" label="New" />}
                      </Stack>
                    }
                    secondary={`${item.body ? `${item.body} · ` : ""}${timeFormat.format(new Date(item.createdAt))}`}
                  />
                  <Stack direction="row" spacing={1}>
                    {item.link !== "/" && (
                      <Button
                        size="small"
                        component={Link}
                        href={item.link}
                        onClick={() => {
                          if (!item.readAt) void markRead(item.id);
                        }}
                        aria-label={`Open: ${item.title}`}
                      >
                        Open
                      </Button>
                    )}
                    {!item.readAt && (
                      <Button size="small" onClick={() => void markRead(item.id)} aria-label={`Mark read: ${item.title}`}>
                        Mark read
                      </Button>
                    )}
                    <Button size="small" onClick={() => void clear(item.id)} aria-label={`Clear: ${item.title}`}>
                      Clear
                    </Button>
                  </Stack>
                </ListItem>
              ))}
            </List>
          </Paper>
        </>
      )}
      <Button component={Link} href="/profile" sx={{ alignSelf: "flex-start" }}>
        Notification settings
      </Button>
    </Stack>
  );
}

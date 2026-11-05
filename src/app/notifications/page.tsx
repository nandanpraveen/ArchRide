"use client";
import Link from "next/link";
import { Alert, Box, Button, IconButton, List, ListItem, Stack, Typography } from "@mui/material";
import NotificationsNoneRounded from "@mui/icons-material/NotificationsNoneRounded";
import CheckRounded from "@mui/icons-material/CheckRounded";
import CloseRounded from "@mui/icons-material/CloseRounded";
import { useNotificationCenter } from "@/components/notifications-provider";

const timeFormat = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "2-digit" });

export default function NotificationsPage() {
  const { notifications, unreadCount, status, saveError, markRead, markAllRead, clear, reload } = useNotificationCenter();
  return (
    <Stack spacing={3} sx={{ maxWidth: 960 }}>
      <Box>
        <Stack direction="row" spacing={2} sx={{ alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", rowGap: 1 }}>
          <Typography component="h1" variant="h1">Notifications</Typography>
          <Button component={Link} href="/profile" aria-label="Notification settings">Settings</Button>
        </Stack>
        <Typography color="text.secondary" variant="body2" sx={{ mt: 1 }}>Only while ArchRide is open. Saved on this device.</Typography>
      </Box>
      {saveError && <Alert severity="error">{saveError}</Alert>}
      {status === "loading" && <Typography role="status">Loading notifications…</Typography>}
      {status === "error" && <Alert severity="error" action={<Button color="inherit" onClick={reload}>Retry</Button>}>Your notifications could not be loaded. Try again.</Alert>}
      {status === "ready" && !notifications.length && <Box sx={{ py: { xs: 3, sm: 5 } }}>
        <NotificationsNoneRounded sx={{ fontSize: 32, color: "text.secondary", mb: 2 }} />
        <Typography component="h2" variant="h2">No notifications</Typography>
        <Typography color="text.secondary" sx={{ mt: 1 }}>Watch a bus to get a reminder here.</Typography>
        <Button component={Link} href="/" sx={{ mt: 2, ml: -1.5 }}>Go to Home</Button>
      </Box>}
      {status === "ready" && notifications.length > 0 && <Box>
        <Stack direction="row" spacing={2} useFlexGap sx={{ alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", mb: 1 }}>
          <Typography role="status" variant="body2" color="text.secondary">{unreadCount ? `${unreadCount} unread` : "All read"}</Typography>
          <Button disabled={!unreadCount} onClick={() => void markAllRead()}>Mark all read</Button>
        </Stack>
        <Box component="section" aria-label="Notification list" sx={{ borderTop: 1, borderColor: "divider" }}>
          <List disablePadding>
            {notifications.map((item) => <ListItem key={item.id} disableGutters divider sx={{ py: 2.5, gap: 2, alignItems: "start", flexWrap: "wrap" }}>
              <Box sx={{ flex: "1 1 260px", minWidth: 0, overflowWrap: "anywhere" }}>
                <Typography component="h2" variant="body1" sx={{ fontWeight: item.readAt ? 500 : 700 }}>{item.title}</Typography>
                {item.body && <Typography variant="body2" color="text.secondary" sx={{ mt: .5 }}>{item.body}</Typography>}
                <Typography component="time" dateTime={item.createdAt} variant="caption" color="text.secondary" sx={{ mt: 1, display: "block" }}>{timeFormat.format(new Date(item.createdAt))}</Typography>
              </Box>
              <Stack direction="row" spacing={1} sx={{ alignItems: "center", ml: "auto" }}>
                {item.link !== "/" && <Button component={Link} href={item.link} onClick={() => { if (!item.readAt) void markRead(item.id); }} aria-label={`Open: ${item.title}`}>Open</Button>}
                {!item.readAt && <IconButton onClick={() => void markRead(item.id)} aria-label={`Mark read: ${item.title}`} title="Mark read"><CheckRounded fontSize="small" /></IconButton>}
                <IconButton onClick={() => void clear(item.id)} aria-label={`Clear: ${item.title}`} title="Clear"><CloseRounded fontSize="small" /></IconButton>
              </Stack>
            </ListItem>)}
          </List>
        </Box>
      </Box>}
      <Box component="details">
        <Typography component="summary" variant="body2" color="text.secondary" sx={{ cursor: "pointer", py: 1.5 }}>About reminders</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ maxWidth: "60ch" }}>Notifications are kept on this device only. Clearing browser data removes them. They are not sent as texts, emails or phone notifications.</Typography>
      </Box>
    </Stack>
  );
}

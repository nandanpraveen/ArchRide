"use client";
import Link from "next/link";
import { Badge, IconButton } from "@mui/material";
import NotificationsRounded from "@mui/icons-material/NotificationsRounded";
import { useNotificationCenter } from "./notifications-provider";

export function NotificationBell() {
  const { unreadCount } = useNotificationCenter();
  return (
    <IconButton
      component={Link}
      prefetch={false}
      href="/notifications"
      aria-label={
        unreadCount ? `Notifications, ${unreadCount} unread` : "Notifications"
      }
    >
      <Badge badgeContent={unreadCount} color="primary" max={9}>
        <NotificationsRounded />
      </Badge>
    </IconButton>
  );
}

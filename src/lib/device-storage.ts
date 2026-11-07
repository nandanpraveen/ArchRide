let account: string | null = null;
const personalKeys = [
  "archride.personal.v1", "archride:saved:v1", "archride.classes.v1",
  "archride.notifications.v1", "archride.notification-preferences.v1",
  "archride.watched-buses.v1", "archride.handled-reminders.v1",
];
export function deviceKey(key: string) {
  return account ? `${key}:account:${account}` : key;
}
export function setDeviceAccount(userId: string) {
  if (!/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(userId)) throw new Error("Invalid account");
  account = userId;
  // Adopt pre-login device data once, never into a second account on this browser.
  try {
    const owner = localStorage.getItem("archride.device-owner");
    if (owner && owner !== userId) return;
    // Claim before copying so a partial storage failure cannot adopt data into another account.
    if (!owner) localStorage.setItem("archride.device-owner", userId);
    for (const key of personalKeys) {
      const value = localStorage.getItem(key);
      if (value !== null && localStorage.getItem(deviceKey(key)) === null) localStorage.setItem(deviceKey(key), value);
      localStorage.removeItem(key);
    }
  } catch { /* Reads and saves retain their existing storage-unavailable states. */ }
}
export function isCurrentDeviceKey(key: string) {
  return account ? key.endsWith(`:account:${account}`) : key.startsWith("archride.") || key.startsWith("archride:");
}

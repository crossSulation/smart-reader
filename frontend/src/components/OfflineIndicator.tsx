import { useEffect, useState } from "react";
import { onOnlineChange } from "../utils/capabilities";
import { WifiOffOutlined } from "@mui/icons-material";

export default function OfflineIndicator() {
  const [online, setOnline] = useState(navigator.onLine);

  useEffect(() => {
    return onOnlineChange(setOnline);
  }, []);

  if (online) return null;

  return (
    <div className="flex items-center gap-1.5 rounded-md bg-amber-100 px-3 py-1.5 text-xs font-medium text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
      <WifiOffOutlined sx={{ fontSize: 14 }} />
      Offline — some features unavailable
    </div>
  );
}

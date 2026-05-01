import { useEffect, useState } from "react";
import { AUTH_EVENTS, getCurrentUser } from "@analytics-bi/shared-lib";

export default function useAuthSnapshot() {
  const [user, setUser] = useState(() => getCurrentUser());

  useEffect(() => {
    const refresh = () => {
      setUser(getCurrentUser());
    };

    window.addEventListener(AUTH_EVENTS.CHANGED, refresh);
    window.addEventListener("storage", refresh);

    return () => {
      window.removeEventListener(AUTH_EVENTS.CHANGED, refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);

  return user;
}

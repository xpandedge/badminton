"use client";

import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { getFirebaseServices } from "@/lib/firebase/client";
import { setSportPreference } from "@/server/users/actions";
import { useAuth } from "@/lib/auth/useAuth";
import { isSport, type Sport } from "@picklebaddies/domain";

interface SportPreferenceState {
  sport: Sport | null;
  isLoaded: boolean;
  /** true while the first-time picker should be shown */
  showPicker: boolean;
  setSport: (sport: Sport) => Promise<void>;
  openPicker: () => void;
  closePicker: () => void;
}

const SportPreferenceContext = createContext<SportPreferenceState>({
  sport: null,
  isLoaded: false,
  showPicker: false,
  setSport: async () => {},
  openPicker: () => {},
  closePicker: () => {},
});

export function SportPreferenceProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [sport, setSportState] = useState<Sport | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [showPicker, setShowPicker] = useState(false);

  useEffect(() => {
    if (!user) {
      setIsLoaded(false);
      setSportState(null);
      setShowPicker(false);
      return;
    }

    const { db } = getFirebaseServices();
    const ref = doc(db, "users", user.uid);

    const unsub = onSnapshot(ref, (snap) => {
      if (snap.exists()) {
        const rawPref = snap.data()?.sportPreference;
        const pref = typeof rawPref === "string" && isSport(rawPref) ? rawPref : null;
        setSportState(pref ?? null);
        setIsLoaded(true);
        // Show picker only if preference has never been set
        if (!pref) setShowPicker(true);
      } else {
        setSportState(null);
        setIsLoaded(true);
        setShowPicker(true);
      }
    });

    return unsub;
  }, [user]);

  const setSport = useCallback(async (s: Sport) => {
    setSportState(s);
    setShowPicker(false);
    const result = await setSportPreference(s);
    if (!result.ok) {
      console.error("Failed to save sport preference:", result.message);
    }
  }, []);

  const openPicker = useCallback(() => setShowPicker(true), []);
  const closePicker = useCallback(() => setShowPicker(false), []);

  return (
    <SportPreferenceContext.Provider value={{ sport, isLoaded, showPicker, setSport, openPicker, closePicker }}>
      {children}
    </SportPreferenceContext.Provider>
  );
}

export function useSportPreference() {
  return useContext(SportPreferenceContext);
}

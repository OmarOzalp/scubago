import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { DEFAULT_HOME, parseHomePreferences, type HomePreferences } from '@/lib/home';

/** A home whose saved settings are still loading. */
const loadingHome = (key: string) => ({ key, preferences: DEFAULT_HOME, loading: true, error: '' });

export function useHomePreferences(ownerId: string) {
  const key = `scubago:home:v1:${ownerId}`;
  // The key on screen, so a save that finishes after an account switch is dropped. Updated on commit, not during render.
  const currentKey = useRef(key);
  useLayoutEffect(() => { currentKey.current = key; }, [key]);
  const [state, setState] = useState(() => loadingHome(key));
  // Another account: start its home from loading, adjusting state during render rather than in the load effect.
  if (state.key !== key) setState(loadingHome(key));
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(key).then((raw) => {
      if (!cancelled) setState({ key, preferences: parseHomePreferences(raw), loading: false, error: '' });
    }).catch(() => {
      if (!cancelled) setState({ key, preferences: DEFAULT_HOME, loading: false, error: 'Your home settings could not be loaded. Try reopening My Home.' });
    });
    return () => { cancelled = true; };
  }, [key]);

  const save = async (preferences: HomePreferences) => {
    if (savingRef.current || state.loading || state.key !== key) return false;
    savingRef.current = true;
    setSaving(true);
    const validated = parseHomePreferences(JSON.stringify(preferences));
    try {
      await AsyncStorage.setItem(key, JSON.stringify(validated));
      if (currentKey.current !== key) return false;
      setState({ key, preferences: validated, loading: false, error: '' });
      return true;
    } catch {
      if (currentKey.current === key) setState((previous) => ({ ...previous, error: 'Could not save your home. Please try again.' }));
      return false;
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };
  return { ...state, preferences: state.key === key ? state.preferences : DEFAULT_HOME, loading: state.loading || state.key !== key, saving, save };
}

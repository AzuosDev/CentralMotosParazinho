import { createContext, useCallback, useContext, useState } from "react";
import type { User } from "../types/api";

export type SubscriptionData = Pick<
  User,
  'email' | 'isLegacyFree' | 'subscriptionStatus' | 'trialEndsAt' | 'subscriptionExpiresAt' | 'plan' | 'billingCycle'
>;

export function computeHasAccess(sub: SubscriptionData | null): boolean {
  if (!sub) return false;
  if (sub.isLegacyFree) return true;
  if (sub.subscriptionStatus === 'active') {
    if (!sub.subscriptionExpiresAt) return true;
    return new Date(sub.subscriptionExpiresAt) > new Date();
  }
  if (sub.subscriptionStatus === 'trial') {
    if (!sub.trialEndsAt) return false;
    return new Date(sub.trialEndsAt) > new Date();
  }
  return false;
}

export function extractSubscription(user: User): SubscriptionData {
  return {
    email: user.email,
    isLegacyFree: user.isLegacyFree ?? false,
    subscriptionStatus: user.subscriptionStatus ?? null,
    trialEndsAt: user.trialEndsAt ?? null,
    subscriptionExpiresAt: user.subscriptionExpiresAt ?? null,
    plan: user.plan ?? null,
    billingCycle: user.billingCycle ?? null,
  };
}

interface AuthContextValue {
  isLocked: boolean;
  lock: () => void;
  unlock: () => void;
  subscription: SubscriptionData | null;
  setSubscription: (s: SubscriptionData | null) => void;
}

const AuthContext = createContext<AuthContextValue>({
  isLocked: true,
  lock: () => {},
  unlock: () => {},
  subscription: null,
  setSubscription: () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [isLocked, setIsLocked] = useState(true);
  const [subscription, setSubscription] = useState<SubscriptionData | null>(null);
  const lock = useCallback(() => setIsLocked(true), []);
  const unlock = useCallback(() => setIsLocked(false), []);
  return (
    <AuthContext.Provider value={{ isLocked, lock, unlock, subscription, setSubscription }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}

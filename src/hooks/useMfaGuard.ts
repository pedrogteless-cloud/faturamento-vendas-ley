import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export type MfaState =
  | { status: "idle" }
  | { status: "checking" }
  | { status: "enrolling"; factorId: string; challengeId: string }
  | { status: "verifying"; factorId: string; challengeId: string }
  | { status: "verified" };

export type MfaGuardResult = {
  mfaState: MfaState;
  mfaError: string | null;
  // Wraps an action: if AAL2 is already active, runs it immediately.
  // Otherwise opens the MFA dialog; the action runs after verification.
  requireMfa: (action: () => void) => Promise<void>;
  submitCode: (code: string) => Promise<void>;
  dismissMfa: () => void;
};

export function useMfaGuard(): MfaGuardResult {
  const [mfaState, setMfaState] = useState<MfaState>({ status: "idle" });
  const [mfaError, setMfaError] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null);

  const requireMfa = useCallback(async (action: () => void) => {
    setMfaError(null);
    setMfaState({ status: "checking" });

    const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (aal?.currentLevel === "aal2") {
      setMfaState({ status: "idle" });
      action();
      return;
    }

    // Need to elevate — find or enroll email factor
    const { data: factors } = await supabase.auth.mfa.listFactors();
    const emailFactor = factors?.all?.find(
      (f) => f.factor_type === "email" && f.status === "verified",
    );

    if (!emailFactor) {
      // First time: enroll email factor
      const { data: enroll, error: enrollErr } = await supabase.auth.mfa.enroll({
        factorType: "email",
      });
      if (enrollErr || !enroll) {
        setMfaError("Não foi possível iniciar a verificação. Tente novamente.");
        setMfaState({ status: "idle" });
        return;
      }
      const { data: challenge, error: challengeErr } = await supabase.auth.mfa.challenge({
        factorId: enroll.id,
      });
      if (challengeErr || !challenge) {
        setMfaError("Não foi possível enviar o código. Tente novamente.");
        setMfaState({ status: "idle" });
        return;
      }
      setPendingAction(() => action);
      setMfaState({ status: "enrolling", factorId: enroll.id, challengeId: challenge.id });
      return;
    }

    // Factor exists — challenge it
    const { data: challenge, error: challengeErr } = await supabase.auth.mfa.challenge({
      factorId: emailFactor.id,
    });
    if (challengeErr || !challenge) {
      setMfaError("Não foi possível enviar o código. Tente novamente.");
      setMfaState({ status: "idle" });
      return;
    }
    setPendingAction(() => action);
    setMfaState({ status: "verifying", factorId: emailFactor.id, challengeId: challenge.id });
  }, []);

  const submitCode = useCallback(
    async (code: string) => {
      if (mfaState.status !== "enrolling" && mfaState.status !== "verifying") return;
      setMfaError(null);

      const { error } = await supabase.auth.mfa.verify({
        factorId: mfaState.factorId,
        challengeId: mfaState.challengeId,
        code,
      });
      if (error) {
        setMfaError("Código incorreto ou expirado. Tente novamente.");
        return;
      }

      setMfaState({ status: "verified" });
      // Small delay so the user sees "Verificado!" before the dialog closes
      setTimeout(() => {
        setMfaState({ status: "idle" });
        pendingAction?.();
        setPendingAction(null);
      }, 600);
    },
    [mfaState, pendingAction],
  );

  const dismissMfa = useCallback(() => {
    setMfaState({ status: "idle" });
    setMfaError(null);
    setPendingAction(null);
  }, []);

  return { mfaState, mfaError, requireMfa, submitCode, dismissMfa };
}

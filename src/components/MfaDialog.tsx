import { useEffect, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import type { MfaState } from "@/hooks/useMfaGuard";

interface MfaDialogProps {
  mfaState: MfaState;
  mfaError: string | null;
  onSubmit: (code: string) => void;
  onCancel: () => void;
}

export function MfaDialog({ mfaState, mfaError, onSubmit, onCancel }: MfaDialogProps) {
  const [code, setCode] = useState("");
  const open =
    mfaState.status === "enrolling" ||
    mfaState.status === "verifying" ||
    mfaState.status === "verified";

  // Reset code whenever dialog opens
  const prevOpen = useRef(false);
  useEffect(() => {
    if (open && !prevOpen.current) setCode("");
    prevOpen.current = open;
  }, [open]);

  function handleComplete(value: string) {
    setCode(value);
    if (value.length === 6) onSubmit(value);
  }

  const isVerified = mfaState.status === "verified";
  const isFirstTime = mfaState.status === "enrolling";

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o && !isVerified) onCancel();
      }}
    >
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>
            {isVerified ? "Identidade confirmada" : "Confirme sua identidade"}
          </DialogTitle>
          <DialogDescription>
            {isVerified
              ? "Verificação concluída. A ação será executada agora."
              : isFirstTime
                ? "Enviamos um código de 6 dígitos para o seu e-mail. Digite-o abaixo para ativar a verificação em duas etapas."
                : "Enviamos um código de 6 dígitos para o seu e-mail. Digite-o abaixo para confirmar a operação."}
          </DialogDescription>
        </DialogHeader>

        {!isVerified && (
          <div className="flex flex-col items-center gap-4 py-2">
            <InputOTP
              maxLength={6}
              value={code}
              onChange={handleComplete}
              disabled={mfaState.status === "verified"}
              autoFocus
            >
              <InputOTPGroup>
                {Array.from({ length: 6 }).map((_, i) => (
                  <InputOTPSlot key={i} index={i} />
                ))}
              </InputOTPGroup>
            </InputOTP>
            {mfaError && <p className="text-xs text-destructive">{mfaError}</p>}
            <p className="text-center text-xs text-muted-foreground">
              O código expira em 10 minutos. Verifique sua caixa de entrada.
            </p>
          </div>
        )}

        {isVerified && (
          <div className="flex justify-center py-4">
            <span className="text-2xl">✓</span>
          </div>
        )}

        {!isVerified && (
          <DialogFooter>
            <button type="button" className="btn-ghost" onClick={onCancel}>
              Cancelar
            </button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}

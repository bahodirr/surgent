"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import { Button } from "@/components/ui/button";
import { usePaywall, useCustomer } from "autumn-js/react";
import { getPaywallContent } from "@/lib/autumn/paywall-content";
import { cn } from "@/lib/utils";
import { Loader2, Rocket } from "lucide-react";
import CheckoutDialog from "./checkout-dialog";

export interface PaywallDialogProps {
  open: boolean;
  setOpen: (open: boolean) => void;
  featureId: string;
  entityId?: string;
}

export default function PaywallDialog(params?: PaywallDialogProps) {
  const { data: preview } = usePaywall({
    featureId: params?.featureId,
    entityId: params?.entityId,
  });
  const { checkout } = useCustomer();
  const [loading, setLoading] = useState(false);

  if (!params || !preview) {
    return <></>;
  }

  const { open, setOpen } = params;
  const { title, message } = getPaywallContent(preview);
  const nextProduct = preview.products?.[0];

  const handleUpgrade = async () => {
    if (!nextProduct?.id) {
      setOpen(false);
      return;
    }

    setLoading(true);
    try {
      await checkout({
        productId: nextProduct.id,
        dialog: CheckoutDialog,
      });
      setOpen(false);
    } catch (error) {
      console.error("Checkout error:", error);
    }
    setLoading(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-[425px] p-0 overflow-hidden gap-0">
        <DialogHeader className="p-6 pb-2">
          <div className="flex flex-col gap-1.5 text-center sm:text-left">
            <DialogTitle className="text-xl font-semibold tracking-tight">
              {title}
            </DialogTitle>
            <div className="text-sm text-muted-foreground leading-relaxed">
              {message}
            </div>
          </div>
        </DialogHeader>

        <DialogFooter className="p-6 pt-2 sm:justify-end gap-3 bg-muted/20 mt-4 border-t">
          {nextProduct && (
            <Button
              size="sm"
              onClick={handleUpgrade}
              disabled={loading}
              className="bg-brand hover:bg-brand/90 text-brand-foreground shadow-sm font-medium px-4 gap-2 transition-all"
            >
              {loading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <>
                  <Rocket className="w-4 h-4" />
                  Upgrade to {nextProduct.name}
                </>
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

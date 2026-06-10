/**
 * Small client-side UX helpers shared by the admin routes.
 *
 * Toasts use the App Bridge global (`window.shopify.toast`) that the
 * embedded AppProvider injects — accessed lazily inside effects so SSR
 * never touches `window`, and via a structural cast so we don't fight
 * the ambient types shipped by @shopify/app-bridge-types.
 */
import { useEffect } from "react";
import { useNavigation } from "react-router";

type ToastCapable = {
  shopify?: {
    toast?: {
      show?: (message: string, opts?: { isError?: boolean }) => void;
    };
  };
};

/**
 * Shows a Shopify admin toast when `flag` is true (e.g. after a save).
 * Pass `actionData?.ok` or a loader-provided `saved` flag.
 */
export function useSaveToast(
  flag: boolean | undefined,
  message: string,
): void {
  useEffect(() => {
    if (flag === true) {
      (window as ToastCapable).shopify?.toast?.show?.(message);
    }
  }, [flag, message]);
}

/**
 * True while a form is submitting. Pass `intent` to track only the form
 * whose hidden `intent` field matches — lets pages with multiple forms
 * show the spinner on the right button.
 */
export function useSubmitting(intent?: string): boolean {
  const navigation = useNavigation();
  if (navigation.state !== "submitting") return false;
  if (intent === undefined) return true;
  return navigation.formData?.get("intent") === intent;
}

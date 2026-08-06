import { useCallback, useSyncExternalStore, type AnchorHTMLAttributes, type MouseEvent } from "react";

/**
 * Roteador minimo baseado na History API.
 * Evita adicionar uma dependencia so para trocar de tela e mantem
 * URLs compartilhaveis e o botao voltar do navegador funcionando.
 */

const listeners = new Set<() => void>();

function notify(): void {
  for (const listener of listeners) {
    listener();
  }
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  window.addEventListener("popstate", listener);

  return () => {
    listeners.delete(listener);
    window.removeEventListener("popstate", listener);
  };
}

function getSnapshot(): string {
  return typeof window === "undefined" ? "/" : window.location.pathname;
}

function getServerSnapshot(): string {
  return "/";
}

export type NavigateOptions = {
  replace?: boolean;
};

export function navigate(path: string, options: NavigateOptions = {}): void {
  if (typeof window === "undefined") {
    return;
  }

  if (window.location.pathname === path && !options.replace) {
    return;
  }

  if (options.replace) {
    window.history.replaceState({}, "", path);
  } else {
    window.history.pushState({}, "", path);
  }

  notify();
}

export function usePathname(): string {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

export function useNavigate(): (path: string, options?: NavigateOptions) => void {
  return useCallback((path: string, options?: NavigateOptions) => navigate(path, options), []);
}

type LinkProps = AnchorHTMLAttributes<HTMLAnchorElement> & {
  to: string;
  replace?: boolean;
};

export function Link({ to, replace = false, onClick, children, ...rest }: LinkProps) {
  function handleClick(event: MouseEvent<HTMLAnchorElement>) {
    onClick?.(event);

    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    ) {
      return;
    }

    event.preventDefault();
    navigate(to, { replace });
  }

  return (
    <a href={to} onClick={handleClick} {...rest}>
      {children}
    </a>
  );
}

/** Retorna o primeiro padrao compativel com o caminho atual. */
export function matchRoute(pathname: string, routes: string[]): string | null {
  const normalized = pathname.replace(/\/+$/, "") || "/";

  for (const route of routes) {
    const normalizedRoute = route.replace(/\/+$/, "") || "/";

    if (normalized === normalizedRoute) {
      return route;
    }
  }

  return null;
}

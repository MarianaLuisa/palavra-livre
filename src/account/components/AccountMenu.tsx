import { useEffect, useRef, useState } from "react";
import { CHAMPIONSHIP_ROUTES } from "../../championship/config";
import { Link, navigate } from "../../router/router";
import { useAuth } from "../AuthProvider";
import { ACCOUNT_ROUTES } from "../config";

const MENU_ITEMS = [
  { to: ACCOUNT_ROUTES.progress, label: "Meu progresso" },
  { to: ACCOUNT_ROUTES.stats, label: "Estatísticas" },
  { to: ACCOUNT_ROUTES.championshipHistory, label: "Campeonatos" },
  { to: ACCOUNT_ROUTES.profile, label: "Perfil" },
];

/** Entrada da conta no cabeçalho: convite para visitantes, menu para quem entrou. */
export function AccountMenu() {
  const auth = useAuth();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function closeOnOutside(event: PointerEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    document.addEventListener("pointerdown", closeOnOutside);
    document.addEventListener("keydown", closeOnEscape);

    return () => {
      document.removeEventListener("pointerdown", closeOnOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, []);

  if (!auth.configured) {
    return null;
  }

  if (!auth.isAuthenticated) {
    return (
      <div className="account-menu">
        <Link className="site-nav-link" to={ACCOUNT_ROUTES.login}>
          Entrar
        </Link>
        <Link className="account-cta" to={ACCOUNT_ROUTES.signUp}>
          Criar conta
        </Link>
      </div>
    );
  }

  const name = auth.profile?.username ?? auth.profile?.displayName ?? "Conta";

  return (
    <div className="account-menu" ref={containerRef}>
      <button
        className="account-trigger"
        type="button"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((current) => !current)}
      >
        <span className="account-avatar" aria-hidden="true">
          {name.charAt(0).toUpperCase()}
        </span>
        <span className="account-name">{name}</span>
        <span className="account-caret" aria-hidden="true">
          ▾
        </span>
      </button>

      <div className={open ? "account-dropdown open" : "account-dropdown"} role="menu">
        {MENU_ITEMS.map((item) => (
          <Link
            key={item.to}
            className="account-dropdown-item"
            to={item.to}
            role="menuitem"
            onClick={() => setOpen(false)}
          >
            {item.label}
          </Link>
        ))}

        {auth.isAdmin ? (
          <Link
            className="account-dropdown-item"
            to={CHAMPIONSHIP_ROUTES.admin}
            role="menuitem"
            onClick={() => setOpen(false)}
          >
            Administração
          </Link>
        ) : null}

        <button
          className="account-dropdown-item danger"
          type="button"
          role="menuitem"
          onClick={() => {
            setOpen(false);
            auth.signOut();
            navigate("/");
          }}
        >
          Sair
        </button>
      </div>
    </div>
  );
}

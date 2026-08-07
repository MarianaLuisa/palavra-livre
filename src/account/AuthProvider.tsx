import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { getErrorMessage } from "../championship/errors";
import { getAccountService } from "./service";
import type { PlayerProfile, SignUpInput, SignUpResult } from "./types";

/**
 * Camada central de autenticacao.
 *
 * Nenhum componente le sessao por conta propria: tudo passa por aqui.
 * A sessao vive no localStorage gerenciado pelo SupabaseClient e sobrevive
 * a refresh, troca de pagina e fechar o navegador. Senha nunca e guardada.
 */
type AuthContextValue = {
  profile: PlayerProfile | null;
  loading: boolean;
  configured: boolean;
  isAuthenticated: boolean;
  /** Sessao existe, mas ainda e anonima (sem e-mail e senha). */
  isAnonymous: boolean;
  isAdmin: boolean;
  error: string | null;
  signIn: (email: string, password: string) => Promise<boolean>;
  signUp: (input: SignUpInput) => Promise<SignUpResult | null>;
  signOut: () => void;
  requestPasswordReset: (email: string, redirectTo?: string) => Promise<boolean>;
  updatePassword: (password: string) => Promise<boolean>;
  setUsername: (username: string) => Promise<boolean>;
  refreshProfile: () => Promise<void>;
  clearError: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const service = useMemo(() => getAccountService(), []);
  const configured = service.isConfigured();
  const [profile, setProfile] = useState<PlayerProfile | null>(null);
  const [loading, setLoading] = useState(configured);
  const [error, setError] = useState<string | null>(null);
  const [sessionTick, setSessionTick] = useState(0);
  const mountedRef = useRef(true);
  // Evita disparar duas cargas de perfil ao mesmo tempo.
  const loadingRef = useRef(false);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const refreshProfile = useCallback(async () => {
    if (!configured || loadingRef.current) {
      setLoading(false);
      return;
    }

    if (!service.hasSession()) {
      setProfile(null);
      setLoading(false);
      return;
    }

    loadingRef.current = true;

    try {
      const nextProfile = await service.getProfile();

      if (mountedRef.current) {
        setProfile(nextProfile);
      }
    } catch (caughtError) {
      console.error("[auth] falha ao carregar o perfil", caughtError);

      if (mountedRef.current) {
        setProfile(null);
      }
    } finally {
      loadingRef.current = false;

      if (mountedRef.current) {
        setLoading(false);
      }
    }
  }, [configured, service]);

  useEffect(() => {
    void refreshProfile();
  }, [refreshProfile, sessionTick]);

  const run = useCallback(
    async <T,>(operation: () => Promise<T>): Promise<T | null> => {
      setError(null);

      try {
        const result = await operation();
        // Sessao pode ter mudado: recarrega o perfil.
        setSessionTick((tick) => tick + 1);
        return result;
      } catch (caughtError) {
        console.error("[auth] operacao falhou", caughtError);

        if (mountedRef.current) {
          setError(getErrorMessage(caughtError));
        }

        return null;
      }
    },
    [],
  );

  const value = useMemo<AuthContextValue>(() => {
    const isAnonymous = service.isAnonymousSession();

    return {
      profile,
      loading,
      configured,
      // Conta permanente. Sessao anonima nao da acesso as areas pessoais.
      isAuthenticated: profile !== null && profile.isPermanent,
      isAnonymous: service.hasSession() && isAnonymous,
      isAdmin: profile?.isAdmin ?? false,
      error,

      signIn: async (email, password) =>
        (await run(async () => {
          await service.signIn(email, password);
          return true;
        })) === true,

      signUp: async (input) =>
        run(async () => {
          // Sessao anonima em andamento: converte preservando o UUID,
          // o que mantem historico e acesso administrativo.
          if (service.hasSession() && service.isAnonymousSession()) {
            return service.convertAnonymousAccount(input);
          }

          return service.signUp(input);
        }),

      signOut: () => {
        service.signOut();
        setProfile(null);
        setSessionTick((tick) => tick + 1);
      },

      requestPasswordReset: async (email, redirectTo) =>
        (await run(async () => {
          await service.requestPasswordReset(email, redirectTo);
          return true;
        })) === true,

      updatePassword: async (password) =>
        (await run(async () => {
          await service.updatePassword(password);
          return true;
        })) === true,

      setUsername: async (username) =>
        (await run(async () => {
          await service.setUsername(username);
          return true;
        })) === true,

      refreshProfile,
      clearError: () => setError(null),
    };
  }, [configured, error, loading, profile, refreshProfile, run, service]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);

  if (context === null) {
    throw new Error("useAuth precisa estar dentro de AuthProvider.");
  }

  return context;
}

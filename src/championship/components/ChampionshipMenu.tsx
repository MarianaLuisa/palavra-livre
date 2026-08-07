import { useAuth } from "../../account/AuthProvider";
import { ACCOUNT_ROUTES } from "../../account/config";
import { Link } from "../../router/router";
import { CHAMPIONSHIP_BRAND, CHAMPIONSHIP_ROUTES, FREE_PLAY_BRAND } from "../config";

/**
 * Navegacao do campeonato dentro do menu suspenso.
 *
 * Fica escondida atras do botao Menu, como no Jogo Livre, para nao roubar
 * espaco do tabuleiro.
 */
export function ChampionshipMenu() {
  const auth = useAuth();

  return (
    <nav className="header-actions" aria-label="Navegação do campeonato">
      <Link className="tool-button" to={CHAMPIONSHIP_ROUTES.home}>
        Início
      </Link>
      <Link className="tool-button" to={CHAMPIONSHIP_ROUTES.leaderboard}>
        Classificação
      </Link>
      <Link className="tool-button" to={CHAMPIONSHIP_ROUTES.history}>
        Histórico
      </Link>
      <Link className="tool-button" to={CHAMPIONSHIP_ROUTES.freePlay}>
        {FREE_PLAY_BRAND.shortName}
      </Link>

      {auth.isAuthenticated ? (
        <>
          <Link className="tool-button" to={ACCOUNT_ROUTES.progress}>
            Meu progresso
          </Link>
          {auth.isAdmin ? (
            <Link className="tool-button" to={CHAMPIONSHIP_ROUTES.admin}>
              Administração
            </Link>
          ) : null}
          <button className="tool-button" type="button" onClick={auth.signOut}>
            Sair
          </button>
        </>
      ) : auth.configured ? (
        <>
          <Link className="tool-button" to={ACCOUNT_ROUTES.login}>
            Entrar
          </Link>
          <Link className="tool-button" to={ACCOUNT_ROUTES.signUp}>
            Criar conta
          </Link>
        </>
      ) : null}

      <span className="menu-brand-note">{CHAMPIONSHIP_BRAND.name}</span>
    </nav>
  );
}

import {
  CHAMPIONSHIP_BRAND,
  CHAMPIONSHIP_ROUTES,
  FREE_PLAY_BRAND,
} from "../championship/config";
import { Link } from "../router/router";

/**
 * Porta de entrada do Palavra Livre.
 * Deixa claro que existem duas formas de jogar e que o modo tradicional
 * continua ilimitado e sem login.
 */
export function HomePage() {
  return (
    <main className="home-layout">
      <header className="home-header">
        <img className="home-mark" src="/palavra-livre.svg" alt="" />
        <h1>Palavra Livre</h1>
        <p>Adivinhe palavras de cinco letras em portugues. Duas formas de jogar.</p>
      </header>

      <div className="home-options">
        <article className="home-card">
          <h2>{FREE_PLAY_BRAND.name}</h2>
          <ul>
            <li>Partidas ilimitadas, quantas vezes quiser</li>
            <li>Simples, Dueto, Quarteto e Sexteto</li>
            <li>Palavras sorteadas no seu navegador</li>
            <li>Sem cadastro e sem classificacao online</li>
          </ul>
          <Link className="primary-button" to={CHAMPIONSHIP_ROUTES.freePlay}>
            Jogar agora
          </Link>
        </article>

        <article className="home-card highlight">
          <h2>{CHAMPIONSHIP_BRAND.name}</h2>
          <ul>
            <li>Uma participacao por dia</li>
            <li>As mesmas 13 palavras para todo mundo</li>
            <li>As quatro modalidades em sequencia</li>
            <li>100 pontos por palavra e bonus por tentativa restante</li>
            <li>Ranking, podio e campeao do dia</li>
          </ul>
          <Link className="primary-button" to={CHAMPIONSHIP_ROUTES.championship}>
            Entrar no {CHAMPIONSHIP_BRAND.eventLabel}
          </Link>
          <nav className="home-links" aria-label="Atalhos do campeonato">
            <Link to={CHAMPIONSHIP_ROUTES.leaderboard}>Classificacao</Link>
            <Link to={CHAMPIONSHIP_ROUTES.history}>Historico</Link>
          </nav>
        </article>
      </div>

      <p className="home-footnote">
        O {FREE_PLAY_BRAND.name} nao exige login. O {CHAMPIONSHIP_BRAND.eventLabel} pede apenas um
        nome de exibicao para identificar sua participacao.
      </p>
    </main>
  );
}

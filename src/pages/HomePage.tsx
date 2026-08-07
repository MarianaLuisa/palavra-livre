import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../account/AuthProvider";
import { StreakBadge } from "../account/components/StreakBadge";
import { ACCOUNT_ROUTES } from "../account/config";
import { getAccountService } from "../account/service";
import type { HomeSummary } from "../account/types";
import {
  CHAMPIONSHIP_BRAND,
  CHAMPIONSHIP_ROUTES,
  FREE_PLAY_BRAND,
} from "../championship/config";
import { formatTime } from "../championship/format";
import { Link } from "../router/router";

function getGreeting(serverNow: string, timeZone = "America/Sao_Paulo"): string {
  const hour = Number(
    new Intl.DateTimeFormat("pt-BR", {
      timeZone,
      hour: "2-digit",
      hourCycle: "h23",
    }).format(new Date(serverNow)),
  );

  if (hour < 12) {
    return "Bom dia";
  }

  return hour < 18 ? "Boa tarde" : "Boa noite";
}

/** Resumo pessoal na home. Só aparece para quem tem conta. */
function LoggedInSummary() {
  const service = useMemo(() => getAccountService(), []);
  const [summary, setSummary] = useState<HomeSummary | null>(null);

  useEffect(() => {
    let active = true;

    service
      .getHomeSummary()
      .then((data) => {
        if (active) {
          setSummary(data);
        }
      })
      .catch((error) => {
        console.error("[home] falha ao carregar o resumo", error);
      });

    return () => {
      active = false;
    };
  }, [service]);

  if (summary === null) {
    return null;
  }

  const name = summary.username ?? summary.displayName;
  const goalReached = summary.todayGames >= summary.dailyGoal;

  return (
    <section className="home-summary" aria-label="Seu resumo de hoje">
      <header>
        <h2>
          {getGreeting(summary.serverNow)}, {name}
        </h2>
        <StreakBadge streak={summary.streak} compact />
      </header>

      <dl className="home-summary-grid">
        <div>
          <dt>Hoje</dt>
          <dd>
            {summary.todayGames} {summary.todayGames === 1 ? "partida" : "partidas"}
          </dd>
        </div>
        <div>
          <dt>Meta diária</dt>
          <dd className={goalReached ? "goal-reached" : undefined}>
            {Math.min(summary.todayGames, summary.dailyGoal)} / {summary.dailyGoal}
          </dd>
        </div>
        {summary.todayChampionship !== null ? (
          <div>
            <dt>Campeonato de hoje</dt>
            <dd>
              {summary.todayChampionship.status === "IN_PROGRESS"
                ? "Em andamento"
                : formatTime(summary.todayChampionship.startsAt)}
            </dd>
          </div>
        ) : null}
      </dl>

      <div className="home-summary-actions">
        <Link className="primary-button" to={CHAMPIONSHIP_ROUTES.freePlay}>
          Continuar jogando
        </Link>
        <Link className="ghost-button" to={ACCOUNT_ROUTES.progress}>
          Ver progresso
        </Link>
      </div>
    </section>
  );
}

/**
 * Porta de entrada do Palavra Livre.
 * Deixa claro que existem duas formas de jogar e que o modo tradicional
 * continua ilimitado e sem login.
 */
export function HomePage() {
  const auth = useAuth();

  return (
    <main className="home-layout">
      <header className="home-header">
        <img className="home-mark" src="/palavra-livre.svg" alt="" />
        <h1>Palavra Livre</h1>
        <p>Adivinhe palavras de cinco letras em português. Duas formas de jogar.</p>
      </header>

      {auth.isAuthenticated ? <LoggedInSummary /> : null}

      <div className="home-options">
        <article className="home-card">
          <h2>{FREE_PLAY_BRAND.name}</h2>
          <ul>
            <li>Partidas ilimitadas, quantas vezes quiser</li>
            <li>Simples, Dueto, Quarteto e Sexteto</li>
            <li>Palavras sorteadas no seu navegador</li>
            <li>Sem cadastro e sem classificação online</li>
          </ul>
          <Link className="primary-button" to={CHAMPIONSHIP_ROUTES.freePlay}>
            Jogar agora
          </Link>
        </article>

        <article className="home-card highlight">
          <h2>{CHAMPIONSHIP_BRAND.name}</h2>
          <ul>
            <li>Uma participação por dia</li>
            <li>As mesmas 13 palavras para todo mundo</li>
            <li>As quatro modalidades em sequência</li>
            <li>100 pontos por palavra e bônus por tentativa restante</li>
            <li>Ranking, pódio e campeão do dia</li>
          </ul>
          <Link className="primary-button" to={CHAMPIONSHIP_ROUTES.championship}>
            Entrar no {CHAMPIONSHIP_BRAND.eventLabel}
          </Link>
          <nav className="home-links" aria-label="Atalhos do campeonato">
            <Link to={CHAMPIONSHIP_ROUTES.leaderboard}>Classificação</Link>
            <Link to={CHAMPIONSHIP_ROUTES.history}>Histórico</Link>
          </nav>
        </article>
      </div>

      {!auth.isAuthenticated && auth.configured ? (
        <section className="home-account-cta">
          <h2>Guarde sua evolução</h2>
          <p>
            Com uma conta, cada partida entra no seu histórico: calendário do mês, sequência
            de dias, estatísticas por modo e seu desempenho no {CHAMPIONSHIP_BRAND.eventLabel}.
          </p>
          <div className="home-summary-actions">
            <Link className="primary-button" to={ACCOUNT_ROUTES.signUp}>
              Criar conta
            </Link>
            <Link className="ghost-button" to={ACCOUNT_ROUTES.login}>
              Já tenho conta
            </Link>
          </div>
        </section>
      ) : null}

      <p className="home-footnote">
        O {FREE_PLAY_BRAND.name} não exige login. O {CHAMPIONSHIP_BRAND.eventLabel} pede apenas um
        nome de exibição para identificar sua participação.
      </p>
    </main>
  );
}
